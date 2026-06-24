import { useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./App.css";

function App() {
  return (
    <ReactFlowProvider>
      <div className="app-layout">
        <Sidebar />
        <MainContent />
        <PropertiesPanel />
      </div>
    </ReactFlowProvider>
  );
}

/* ─── Sidebar: Connection + Schema Browser ─── */
function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>DataForge</h2>
        <span className="tagline">AI Data Modeling IDE</span>
      </div>

      <section className="panel-section">
        <h3>Connections</h3>
        <button className="btn">+ Add Connection</button>
      </section>

      <section className="panel-section">
        <h3>Schema Browser</h3>
        <div className="schema-tree">
          <p className="placeholder">Connect to a database to browse schema</p>
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

/* ─── Main: Canvas + Chat ─── */
function MainContent() {
  const [activeTab, setActiveTab] = useState<"canvas" | "chat">("canvas");

  return (
    <main className="main-content">
      <div className="tab-bar">
        <button
          className={`tab ${activeTab === "canvas" ? "active" : ""}`}
          onClick={() => setActiveTab("canvas")}
        >
          Data Flow
        </button>
        <button
          className={`tab ${activeTab === "chat" ? "active" : ""}`}
          onClick={() => setActiveTab("chat")}
        >
          AI Chat
        </button>
      </div>

      <div className="tab-content">
        {activeTab === "canvas" ? <FlowCanvas /> : <ChatPanel />}
      </div>
    </main>
  );
}

/* ─── Data Flow Canvas (React Flow) ─── */
function FlowCanvas() {
  return (
    <div className="canvas-container">
      <div className="canvas-empty">
        <div className="empty-icon">○</div>
        <h3>Data Flow Canvas</h3>
        <p>Drag tables here to start building your data model.</p>
        <p className="hint">Or use the AI Chat to generate a model automatically.</p>
      </div>
    </div>
  );
}

/* ─── AI Chat Panel ─── */
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

/* ─── Properties / Output Panel ─── */
function PropertiesPanel() {
  return (
    <aside className="properties-panel">
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
    </aside>
  );
}

export default App;
