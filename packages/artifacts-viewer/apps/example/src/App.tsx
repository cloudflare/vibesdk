import type { ArtifactSelection } from "artifacts-viewer/react";
import { useState } from "react";
import type { ReactElement } from "react";
import { defaultExample, examples } from "./examples/registry.ts";
import { repoName } from "./examples/shared.ts";

export function App(): ReactElement {
  const [activeId, setActiveId] = useState(defaultExample.id);
  const [selection, setSelection] = useState<ArtifactSelection | null>(null);

  const active = examples.find((example) => example.id === activeId) ?? defaultExample;

  return (
    <div className={`stage ${active.themeClass}`}>
      <div aria-hidden="true" className="stage__atmosphere" />

      <div className="stage__inner">
        <nav aria-label="Example designs" className="rail">
          <span className="rail__label">Designs</span>
          {examples.map((example, index) => (
            <button
              aria-pressed={example.id === activeId}
              className="switch"
              key={example.id}
              onClick={() => {
                setActiveId(example.id);
                setSelection(null);
              }}
              type="button"
            >
              <span className="switch__index">{String(index + 1).padStart(2, "0")} </span>
              {example.label}
            </button>
          ))}
        </nav>

        <header className="masthead">
          <h1 className="masthead__title">{active.title}</h1>
          <p className="masthead__tagline">{active.tagline}</p>
          <ul className="credits">
            {active.credits.map((credit) => (
              <li key={credit.role}>
                {credit.role} <b>{credit.value}</b>
              </li>
            ))}
          </ul>
        </header>

        {/* Keyed on the example so switching remounts the viewer with a clean
            selection and replays the theme's entry animation. */}
        <div className="viewer-frame" key={active.id}>
          <active.Component onSelect={setSelection} />
        </div>

        <footer className="readout">
          <span>{repoName}</span>
          {selection === null ? (
            <span>nothing selected</span>
          ) : (
            <>
              <span>{selection.type}</span>
              <span className="readout__path">{selection.path === "" ? "/" : selection.path}</span>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
