"""
Reverse proxy server for VibeSDK.
Routes ALL requests from port 8001 to the Vite dev server on port 3000.
This bridges the Emergent ingress with the Cloudflare Workers backend
running inside Vite.
"""
import httpx
import logging
from fastapi import FastAPI, Request
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vibesdk-proxy")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

VITE_URL = "http://localhost:3000"


@app.api_route("/", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
async def proxy_root(request: Request):
    return await _proxy_request(request, "")


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
async def proxy(request: Request, path: str):
    return await _proxy_request(request, path)


async def _proxy_request(request: Request, path: str):
    target_url = f"{VITE_URL}/{path}"
    logger.info(f"Proxying: {request.method} /{path} -> {target_url}")

    headers = dict(request.headers)
    headers.pop("host", None)
    headers["host"] = "localhost"

    body = await request.body()

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body,
                params=request.query_params,
                follow_redirects=True,
            )
        except httpx.ConnectError:
            logger.error(f"Cannot connect to Vite dev server at {VITE_URL}")
            return Response(
                content='{"error":"Vite dev server not ready on port 3000"}',
                status_code=503,
                media_type="application/json",
            )

    excluded_headers = {"content-encoding", "content-length", "transfer-encoding", "connection"}
    resp_headers = {
        k: v for k, v in response.headers.items()
        if k.lower() not in excluded_headers
    }

    logger.info(f"Response: {response.status_code} for /{path}")
    return Response(
        content=response.content,
        status_code=response.status_code,
        headers=resp_headers,
    )
