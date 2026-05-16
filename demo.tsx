export default function ScientificPaper({ time, props, size }) {
  const title =
    typeof props.title === "string"
      ? props.title
      : "Code Objects as Deterministic React Compositions";
  const subtitle =
    typeof props.subtitle === "string"
      ? props.subtitle
      : "A Scientific-Style A4 Layout for Clipper";
  const author =
    typeof props.author === "string" ? props.author : "Ronan O'Connor";
  const affiliation =
    typeof props.affiliation === "string"
      ? props.affiliation
      : "Clipper Research Notes";
  const date = typeof props.date === "string" ? props.date : "May 2026";

  const scale = Math.min(size.width / 794, size.height / 1123);
  const pageWidth = 794;
  const pageHeight = 1123;
  const pulse = 0.5 + 0.5 * Math.sin(time * 1.8);

  const styles = {
    host: {
      width: size.width,
      height: size.height,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background:
        "linear-gradient(135deg, #d8dde6 0%, #eef1f5 42%, #cfd6df 100%)",
      fontFamily:
        "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      color: "#111827",
      overflow: "hidden",
    },
    page: {
      width: pageWidth,
      height: pageHeight,
      transform: `scale(${scale})`,
      transformOrigin: "center",
      background: "#fbfaf7",
      boxShadow: "0 26px 70px rgba(31, 41, 55, 0.28)",
      padding: "58px 64px 54px",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      gap: 18,
      position: "relative",
    },
    rule: {
      height: 2,
      background:
        "linear-gradient(90deg, #1f2937 0%, #1f2937 34%, #a23b3b 34%, #a23b3b 50%, #2d6f6d 50%, #2d6f6d 100%)",
      opacity: 0.9,
    },
    title: {
      margin: "0 0 6px",
      fontFamily: "Georgia, Times New Roman, serif",
      fontSize: 34,
      lineHeight: 1.08,
      fontWeight: 700,
      letterSpacing: 0,
      color: "#111111",
    },
    subtitle: {
      margin: 0,
      fontSize: 13,
      lineHeight: 1.4,
      color: "#5b6472",
      textTransform: "uppercase",
      letterSpacing: 1.2,
      fontWeight: 700,
    },
    meta: {
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: 18,
      alignItems: "end",
      paddingBottom: 10,
      borderBottom: "1px solid #cfd4dc",
      fontSize: 12,
      lineHeight: 1.45,
      color: "#4b5563",
    },
    abstractBox: {
      display: "grid",
      gridTemplateColumns: "72px 1fr",
      gap: 16,
      padding: "14px 0 12px",
      borderBottom: "1px solid #d9dde3",
    },
    label: {
      fontSize: 10,
      lineHeight: 1,
      color: "#8a2f2f",
      fontWeight: 800,
      letterSpacing: 1.4,
      textTransform: "uppercase",
    },
    abstract: {
      margin: 0,
      fontFamily: "Georgia, Times New Roman, serif",
      fontSize: 12.4,
      lineHeight: 1.55,
      color: "#2f3742",
    },
    content: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 28,
      flex: 1,
      minHeight: 0,
    },
    section: {
      margin: "0 0 13px",
      breakInside: "avoid",
    },
    heading: {
      margin: "0 0 5px",
      fontSize: 11,
      lineHeight: 1.2,
      color: "#0f172a",
      fontWeight: 900,
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    paragraph: {
      margin: "0 0 8px",
      fontFamily: "Georgia, Times New Roman, serif",
      fontSize: 11.3,
      lineHeight: 1.52,
      color: "#222936",
      textAlign: "justify",
    },
    figure: {
      margin: "12px 0 14px",
      border: "1px solid #cfd4dc",
      background: "#f1f3f5",
      padding: 10,
    },
    diagram: {
      height: 92,
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 8,
      alignItems: "center",
    },
    node: {
      minHeight: 54,
      border: "1px solid #b7bec8",
      background: "#ffffff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      fontSize: 9.5,
      lineHeight: 1.2,
      color: "#263241",
      fontWeight: 800,
      padding: 8,
      boxSizing: "border-box",
    },
    caption: {
      margin: "7px 0 0",
      fontSize: 9.4,
      lineHeight: 1.35,
      color: "#667085",
    },
    table: {
      width: "100%",
      borderCollapse: "collapse",
      margin: "9px 0 12px",
      fontSize: 9.5,
      lineHeight: 1.25,
    },
    th: {
      textAlign: "left",
      borderBottom: "1px solid #8d98a7",
      padding: "5px 4px",
      color: "#111827",
      fontWeight: 900,
    },
    td: {
      borderBottom: "1px solid #d6dae0",
      padding: "5px 4px",
      color: "#374151",
      verticalAlign: "top",
    },
    footer: {
      display: "grid",
      gridTemplateColumns: "1fr auto",
      borderTop: "1px solid #cfd4dc",
      paddingTop: 10,
      fontSize: 9.5,
      color: "#6b7280",
    },
    accent: {
      position: "absolute",
      right: 38,
      top: 40,
      width: 8,
      height: 120,
      background: `rgba(162, 59, 59, ${0.32 + pulse * 0.12})`,
    },
  };

  return (
    <div style={styles.host}>
      <article style={styles.page}>
        <div style={styles.accent} />
        <div style={styles.rule} />

        <header>
          <p style={styles.subtitle}>{subtitle}</p>
          <h1 style={styles.title}>{title}</h1>
        </header>

        <div style={styles.meta}>
          <div>
            <strong>{author}</strong>
            <br />
            {affiliation}
          </div>
          <div>{date}</div>
        </div>

        <section style={styles.abstractBox}>
          <div style={styles.label}>Abstract</div>
          <p style={styles.abstract}>
            This paper presents a deterministic composition model for Clipper
            code objects: React components bundled from project assets, isolated
            at render time, and driven entirely by the player clock. The result
            is a reproducible visual primitive suitable for scrub-accurate
            preview, export, and asset-local authoring.
          </p>
        </section>

        <main style={styles.content}>
          <div>
            <section style={styles.section}>
              <h2 style={styles.heading}>1. Introduction</h2>
              <p style={styles.paragraph}>
                Code objects extend compose mode with arbitrary React
                components. Each object stores a source asset identifier in its
                props and inherits ordinary frame bounds, enabling authored
                components to behave like native canvas objects while remaining
                project-owned files.
              </p>
              <p style={styles.paragraph}>
                The component contract is intentionally small: render is a pure
                function of time, props, and size. This excludes independent
                timers and external animation drivers, preserving determinism
                during playback, scrubbing, and export.
              </p>
            </section>

            <section style={styles.section}>
              <h2 style={styles.heading}>2. Component Contract</h2>
              <p style={styles.paragraph}>
                An entry asset exports a default function that receives scene
                time in seconds, sanitized user props, and numeric object
                bounds. Relative imports are bundled with the entry, while React
                is externalized through the host bridge to preserve hook module
                identity.
              </p>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Input</th>
                    <th style={styles.th}>Role</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={styles.td}>time</td>
                    <td style={styles.td}>Frame-accurate scene clock</td>
                  </tr>
                  <tr>
                    <td style={styles.td}>props</td>
                    <td style={styles.td}>Inspector-provided JSON values</td>
                  </tr>
                  <tr>
                    <td style={styles.td}>size</td>
                    <td style={styles.td}>Object bounds in canvas pixels</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section style={styles.section}>
              <h2 style={styles.heading}>3. Runtime Isolation</h2>
              <p style={styles.paragraph}>
                Render failures are contained by a per-instance boundary, while
                compile failures are surfaced through the same error map. This
                keeps unrelated objects live and gives the inspector a single
                path for reporting source, stack, and location details.
              </p>
            </section>
          </div>

          <div>
            <section style={styles.section}>
              <h2 style={styles.heading}>4. Bundling Pipeline</h2>
              <div style={styles.figure}>
                <div style={styles.diagram}>
                  <div style={styles.node}>Asset TSX Source</div>
                  <div style={styles.node}>esbuild Bundle</div>
                  <div style={styles.node}>CodeObjectFrame</div>
                </div>
                <p style={styles.caption}>
                  Figure 1. Source assets compile to content-addressed bundles
                  and mount inside an isolated preview frame.
                </p>
              </div>
              <p style={styles.paragraph}>
                The runtime tracks the dependency graph produced during
                bundling. Mounted assets are retained, watched on disk, and
                recompiled when the entry or a relative import changes. A small
                content-hash cache prevents redundant evaluation.
              </p>
            </section>

            <section style={styles.section}>
              <h2 style={styles.heading}>5. Discussion</h2>
              <p style={styles.paragraph}>
                The architecture favors local authorship over global extension.
                Components can compose rich layouts, diagrams, generated marks,
                and interactive-looking scientific figures without gaining
                access to host internals or nondeterministic browser clocks.
              </p>
              <p style={styles.paragraph}>
                This separation also keeps inspector behavior regular: object
                bounds remain native, props are explicit JSON, and code-specific
                failure state is reported without changing the rest of the
                composition model.
              </p>
            </section>

            <section style={styles.section}>
              <h2 style={styles.heading}>6. Conclusion</h2>
              <p style={styles.paragraph}>
                Code objects provide a compact bridge between authored React and
                Clipper's deterministic timeline. The model is sufficient for A4
                documents, explanatory visuals, and publication-style motion
                graphics while keeping export behavior reproducible.
              </p>
            </section>
          </div>
        </main>

        <footer style={styles.footer}>
          <span>
            Scientific paper code object generated from CODE_OBJECTS.md
          </span>
          <span>01</span>
        </footer>
      </article>
    </div>
  );
}
