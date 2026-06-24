import { useState, useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./App.css";
import Settings from "./components/Settings";
import ConnectionDialog from "./components/ConnectionDialog";

interface Connection {
  name: string;
  dsn: string;
}

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connDialogOpen, setConnDialogOpen] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);

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

  function handleConnected(name: string, dsn: string) {
    setConnections((prev) => {
      const filtered = prev.filter((c) => c.name !== name);
      return [...filtered, { name, dsn }];
    });
  }

  return (
    <ReactFlowProvider>
      <div className="app-layout">
        <Sidebar
          connections={connections}
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
function Sidebar({ connections, onAddClick }: { connections: Connection[]; onAddClick: () => void }) {
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
            <div key={c.name} className="conn-item">
              <span className="conn-dot" />
              <span className="conn-name">{c.name}</span>
            </div>
          ))}
        </div>
        <button className="btn" onClick={onAddClick}>+ Add Connection</button>
      </section>

      <section className="panel-section">
        <h3>Schema Browser</h3>
        <div className="schema-tree">
          <p className="placeholder">
            {connections.length === 0
              ? "Connect to a database to browse schema"
              : "Select a connection to browse"}
          </p>
        </div>
      </section>

      <section className="panel-section">
        <h3>Project Files</h3>
        <div className="file-tree">
          <p className="placeholder">dbt project files appear here</p>
        </div>
      </section>
    </aside>
  );
}

/* ─── Main: Canvas ─── */
function MainContent() {
  return (
    <main className="main-content">
      <FlowCanvas />
    </main>
  );
}

function FlowCanvas() {
  return (
    <div className="canvas-container">
      <div className="canvas-empty">
        <div className="empty-icon">○</div>
        <h3>Data Flow Canvas</h3>
        <p>Drag tables here to start building your data model.</p>
        <p className="hint">Use AI Chat to generate a model automatically.</p>
      </div>
    </div>
  );
}

/* ─── Right Panel ─── */
function RightPanel() {
  const [activeTab, setActiveTab] = useState<"properties" | "chat">("properties");

  return (
    <aside className="right-panel">
      <div className="right-tab-bar">
        <button
          className={`tab ${activeTab === "properties" ? "active" : ""}`}
          onClick={() => setActiveTab("properties")}
        >Properties</button>
        <button
          className={`tab ${activeTab === "chat" ? "active" : ""}`}
          onClick={() => setActiveTab("chat")}
        >AI Chat</button>
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
      <section className="panel-section">
        <h3>Properties</h3>
        <p className="placeholder">Select a table or model to see properties</p>
      </section>
      <section className="panel-section">
        <h3>Generated Output</h3>
        <div className="output-list">
          <p className="placeholder">dbt models will appear here</p>
        </div>
        <button className="btn" disabled>Generate dbt Project</button>
      </section>
      <section className="panel-section">
        <h3>Data Quality</h3>
        <p className="placeholder">Run profile to see stats</p>
      </section>
    </>
  );
}

export default App;
