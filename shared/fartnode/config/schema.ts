export const fartSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://fartnode.dev/schemas/fart.schema.json",
  "title": "FARTNODE Project Configuration",
  "description": "Schema for fart.yaml files that describe a FARTNODE deployment.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "project",
    "solana"
  ],
  "definitions": {
    "publicKey": {
      "type": "string",
      "pattern": "^[1-9A-HJ-NP-Za-km-z]{32,44}$",
      "description": "Base58 encoded Solana public key"
    },
    "moduleToggle": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "enabled": {
          "type": "boolean",
          "default": true,
          "description": "Whether the module is enabled"
        },
        "authority": {
          "$ref": "#/definitions/publicKey",
          "description": "Optional override authority for the module"
        },
        "options": {
          "type": "object",
          "additionalProperties": true,
          "description": "Module-specific configuration overrides"
        }
      }
    },
    "percentage": {
      "type": "number",
      "minimum": 0,
      "maximum": 100
    }
  },
  "properties": {
    "project": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name",
        "slug"
      ],
      "properties": {
        "name": {
          "type": "string",
          "minLength": 3,
          "description": "Human readable name for the project"
        },
        "slug": {
          "type": "string",
          "pattern": "^[a-z0-9-]+$",
          "description": "URL safe identifier used for storage buckets and preview apps"
        },
        "description": {
          "type": "string",
          "maxLength": 280,
          "description": "Short description that appears in the wizard and templates"
        },
        "thumbnail": {
          "type": "string",
          "format": "uri",
          "description": "Optional preview image served alongside generated apps"
        }
      }
    },
    "solana": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "cluster",
        "programs"
      ],
      "properties": {
        "cluster": {
          "type": "string",
          "enum": [
            "localnet",
            "devnet",
            "testnet",
            "mainnet-beta"
          ],
          "default": "devnet",
          "description": "Solana cluster that the generated experience should target"
        },
        "rpcUrl": {
          "type": "string",
          "format": "uri",
          "description": "Optional custom RPC endpoint. Defaults based on cluster if omitted"
        },
        "priorityFeeMicroLamports": {
          "type": "integer",
          "minimum": 0,
          "description": "Optional priority fee to apply to submitted transactions"
        },
        "programs": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "points",
            "quests",
            "escrow",
            "registry"
          ],
          "properties": {
            "points": {
              "$ref": "#/definitions/publicKey",
              "description": "Program ID for the points program"
            },
            "quests": {
              "$ref": "#/definitions/publicKey",
              "description": "Program ID for the quests program"
            },
            "escrow": {
              "$ref": "#/definitions/publicKey",
              "description": "Program ID for the escrow program"
            },
            "registry": {
              "$ref": "#/definitions/publicKey",
              "description": "Program ID for the registry program"
            }
          }
        },
        "mints": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "points": {
              "$ref": "#/definitions/publicKey",
              "description": "Token mint used for the points module"
            },
            "rewards": {
              "$ref": "#/definitions/publicKey",
              "description": "Optional rewards mint for escrow payouts"
            }
          }
        }
      }
    },
    "modules": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "points": {
          "$ref": "#/definitions/moduleToggle"
        },
        "quests": {
          "$ref": "#/definitions/moduleToggle"
        },
        "escrow": {
          "$ref": "#/definitions/moduleToggle"
        },
        "badges": {
          "$ref": "#/definitions/moduleToggle"
        }
      }
    },
    "templates": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "default": {
          "type": "string",
          "enum": [
            "arcade",
            "rpg-lite"
          ],
          "default": "arcade"
        },
        "available": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "uniqueItems": true,
          "default": [
            "arcade",
            "rpg-lite"
          ]
        }
      }
    },
    "attestation": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "authority": {
          "$ref": "#/definitions/publicKey"
        },
        "dnsTxtRecord": {
          "type": "string",
          "description": "TXT record value used for DNS based verification"
        },
        "siwsDomain": {
          "type": "string",
          "description": "Domain expected in Sign-In With Solana flow"
        }
      }
    },
    "treasury": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "vault": {
          "$ref": "#/definitions/publicKey",
          "description": "Vault account that holds escrowed rewards"
        },
        "distribution": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "creator": {
              "$ref": "#/definitions/percentage"
            },
            "community": {
              "$ref": "#/definitions/percentage"
            },
            "treasury": {
              "$ref": "#/definitions/percentage"
            }
          }
        }
      }
    }
  }
} as const;
