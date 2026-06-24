import { useState, useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./App.css";
import Settings from "./components/Settings";
import ConnectionDialog from "./components/ConnectionDialog";

interface Connection { name: string; dsn: string }
interface Column { name: string; type: string; nullable: boolean; pk: boolean; }
interface TableInfo { table: string; schema: string; type: string; columns: Column[]; primary_key: string[]; foreign_keys: any[]; }

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connDialogOpen, setConnDialogOpen] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeConn, setActiveConn] = useState<string | null>(null);
  const [schema, setSchema] = useState<TableInfo[]>([]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    async function setup() {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen("menu-action", (event: any) => {
        const { action } = event.payload;
        if (action === "settings") setSettingsOpen(true);
        if (action === "add_connection") setConnDialogOpen(true);
      });
    }
    setup();
    return () => { if (unlisten) unlisten(); };
  }, []);

  // Fetch schema when a connection is selected
  useEffect(() => {
    if (!activeConn) { setSchema([]); return; }
    (async () => {
      try {
        const res = await (window as any).__TAURI_INTERNALS__.invoke("engine_call", {
          method: "schema",
          params: JSON.stringify({ connection: activeConn }),
        });
        const data = JSON.parse(res);
        if (data.result) setSchema(data.result);
      } catch (e) {
        console.error("Failed to fetch schema", e);
      }
    })();
  }, [activeConn]);

  function handleConnected(name: string, dsn: string) {
    setConnections((prev) => {
      const filtered = prev.filter((c) => c.name !== name);
      return [...filtered, { name, dsn }];
    });
    setActiveConn(name);
  }

  return (
    <ReactFlowProvider>
      <div className="app-layout">
        <Sidebar
          connections={connections}
          activeConn={activeConn}
          schema={schema}
          onSelectConn={setActiveConn}
          onAddClick={() => setConnDialogOpen(true)}
        />
        <MainContent />
        <RightPanel />
      </div>
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ConnectionDialog
        open={connDialogOpen}
        onClose={() => setConnDialogOpen(false)}
        onConnected={handleConnected}
      />
    </ReactFlowProvider>
  );
}

/* ─── Sidebar ─── */
function Sidebar({
  connections, activeConn, schema, onSelectConn, onAddClick,
}: {
  connections: Connection[]; activeConn: string | null; schema: TableInfo[];
  onSelectConn: (name: string) => void; onAddClick: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>DataForge</h2>
        <span className="tagline">AI Data Modeling IDE</span>
      </div>

      <section className="panel-section">
        <h3>Connections</h3>
        <div className="conn-list">
          {connections.length === 0 && (
            <p className="placeholder">No connections yet</p>
          )}
          {connections.map((c) => (
            <div
              key={c.name}
              className={`conn-item ${activeConn === c.name ? "active" : ""}`}
              onClick={() => onSelectConn(c.name)}
            >
              <span className="conn-dot" />
              <span className="conn-name">{c.name}</span>
            </div>
          ))}
        </div>
        <button className="btn" onClick={onAddClick}>+ Add Connection</button>
      </section>

      <section className="panel-section schema-section">
        <h3>Schema Browser</h3>
        <div className="schema-tree">
          {schema.length === 0 && (
            <p className="placeholder">
              {connections.length === 0
                ? "Connect to a database"
                : "Select a connection"}
            </p>
          )}
          {schema.map((t) => (
            <SchemaTableNode key={`${t.schema}.${t.table}`} table={t} />
          ))}
        </div>
      </section>
    </aside>
  );
}

/* ─── Schema Tree Node ─── */
function SchemaTableNode({ table }: { table: TableInfo }) {
  const [expanded, setExpanded] = useState(false);
  const icon = table.type === "view" ? "👁" : "⊞";

  return (
    <div className="schema-node">
      <div className="schema-table" onClick={() => setExpanded(!expanded)}>
        <span className="schema-expand">{expanded ? "▾" : "▸"}</span>
        <span className="schema-icon">{icon}</span>
        <span className="schema-table-name">{table.table}</span>
        <span className="schema-type">{table.type}</span>
      </div>
      {expanded && (
        <div className="schema-columns">
          {table.columns.map((col) => (
            <div key={col.name} className="schema-col">
              <span className="col-name">{col.name}</span>
              <span className="col-type">{col.type}</span>
              {col.pk && <span className="col-badge pk">PK</span>}
            </div>
          ))}
          {table.foreign_keys.map((fk, i) => (
            <div key={i} className="schema-col schema-fk">
              <span className="col-name">→ {fk.ref_table}</span>
              <span className="col-type">{fk.columns.join(", ")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main ─── */
function MainContent() {
  return (
    <main className="main-content">
      <div className="canvas-container">
        <div className="canvas-empty">
          <div className="empty-icon">○</div>
          <h3>Data Flow Canvas</h3>
          <p>Drag tables here to start building your data model.</p>
          <p className="hint">Use AI Chat to generate a model automatically.</p>
        </div>
      </div>
    </main>
  );
}

/* ─── Right Panel ─── */
function RightPanel() {
  const [activeTab, setActiveTab] = useState<"properties" | "chat">("properties");
  return (
    <aside className="right-panel">
      <div className="right-tab-bar">
        <button className={`tab ${activeTab === "properties" ? "active" : ""}`} onClick={() => setActiveTab("properties")}>Properties</button>
        <button className={`tab ${activeTab === "chat" ? "active" : ""}`} onClick={() => setActiveTab("chat")}>AI Chat</button>
      </div>
      <div className="right-tab-content">
        {activeTab === "properties" ? <PropertiesPanel /> : <ChatPanel />}
      </div>
    </aside>
  );
}

function ChatPanel() {
  return (
    <div className="chat-panel">
      <div className="chat-messages">
        <div className="message system">
          <strong>DataForge AI</strong>
          <p>Connect to a database, then I can help you analyze schema and suggest data models.</p>
        </div>
      </div>
      <div className="chat-input">
        <input type="text" placeholder="Ask me anything about your data..." disabled />
        <button className="btn" disabled>Send</button>
      </div>
    </div>
  );
}

function PropertiesPanel() {
  return (
    <>
      <section className="panel-section"><h3>Properties</h3><p className="placeholder">Select a table or model</p></section>
      <section className="panel-section">
        <h3>Generated Output</h3>
        <div className="output-list"><p className="placeholder">dbt models will appear here</p></div>
        <button className="btn" disabled>Generate dbt Project</button>
      </section>
      <section className="panel-section"><h3>Data Quality</h3><p className="placeholder">Run profile to see stats</p></section>
    </>
  );
}

export default App;
