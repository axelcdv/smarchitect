interface ProjectDocumentPanelProps {
  yaml: string;
}

export function ProjectDocumentPanel({
  yaml
}: ProjectDocumentPanelProps) {
  return (
    <section className="yaml-panel" aria-labelledby="yaml-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Source of truth</p>
          <h2 id="yaml-title">Project Document</h2>
        </div>
        <span className="valid-chip">Valid YAML</span>
      </div>
      <textarea
        aria-label="Project Document YAML"
        value={yaml}
        readOnly
        spellCheck={false}
      />
    </section>
  );
}
