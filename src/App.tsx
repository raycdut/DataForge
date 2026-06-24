import { useState, useEffect, useCallback, useRef } from "react";
import {
  ReactFlowProvider,
  ReactFlow,
  useReactFlow,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnDragOverParams,
  Background,
  Controls,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./App.css";
import Settings from "./components/Settings";
import ConnectionDialog from "./components/ConnectionDialog";

interface Connection { name: string; dsn: string }
interface Column { name: string; type: string; nullable: boolean; pk: boolean; }
interface TableInfo { table: string; schema: string; type: string; columns: Column[]; primary_key: string[]; foreign_keys: any[]; }

/* ─── Custom Table Node ─── */
function TableNode({ data }: { data: { label: string; table: string; columns: Column[]; fks: any[]; selected?: boolean } }) {
  return (
    <div className={`flow-table-node ${data.selected ? "selected" : ""}`}>
      <div className="flow-table-header">{data.label}</div>
      <div className="flow-table-cols">
        {data.columns.map((col: Column) => (
          <div key={col.name} className="flow-table-col">
            <span className="col-name">{col.name}</span>
            <span className="col-type">{col.type.split("(")[0]}</span>
            {col.pk && <span className="col-badge pk">PK</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

const nodeTypes = { tableNode: TableNode };

/* ─── App ─── */
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
        <FlowCanvas />
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
function Sidebar({ connections, activeConn, schema, onSelectConn, onAddClick }: {
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
          {connections.length === 0 && <p className="placeholder">No connections yet</p>}
          {connections.map((c) => (
            <div key={c.name} className={`conn-item ${activeConn === c.name ? "active" : ""}`}
              onClick={() => onSelectConn(c.name)}>
              <span className="conn-dot" /><span className="conn-name">{c.name}</span>
            </div>
          ))}
        </div>
        <button className="btn" onClick={onAddClick}>+ Add Connection</button>
      </section>
      <section className="panel-section schema-section">
        <h3>Schema Browser</h3>
        <div className="schema-tree">
          {schema.length === 0 && <p className="placeholder">Connect to a database</p>}
          {schema.map((t) => (
            <SchemaTableNode key={`${t.schema}.${t.table}`} table={t} />
          ))}
        </div>
      </section>
    </aside>
  );
}

/* ─── Schema Tree Node (draggable) ─── */
function SchemaTableNode({ table }: { table: TableInfo }) {
  const [expanded, setExpanded] = useState(false);
  const icon = table.type === "view" ? "👁" : "⊞";

  function onDragStart(event: React.DragEvent) {
    event.dataTransfer.setData("application/json", JSON.stringify(table));
    event.dataTransfer.effectAllowed = "copy";
  }

  return (
    <div className="schema-node">
      <div className="schema-table"
        onClick={() => setExpanded(!expanded)}
        draggable
        onDragStart={onDragStart}
      >
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

/* ─── Flow Canvas (React Flow with drag-and-drop) ─── */
function FlowCanvas() {
  const reactFlow = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const idCounter = useRef(0);

  const onDragOver = useCallback((event: OnDragOverParams) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback((event: any) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/json");
    if (!raw) return;
    const table: TableInfo = JSON.parse(raw);

    const position = reactFlow.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    idCounter.current += 1;
    const newNode: Node = {
      id: `table-${idCounter.current}`,
      type: "tableNode",
      position,
      data: {
        label: table.table,
        table: table.table,
        columns: table.columns,
        fks: table.foreign_keys,
      },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [reactFlow, setNodes]);

  // Show empty state only when no nodes
  if (nodes.length === 0) {
    return (
      <main className="main-content">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onDragOver={onDragOver}
          onDrop={onDrop}
          nodeTypes={nodeTypes}
          fitView
        >
          <div className="canvas-empty" style={{ pointerEvents: "none", position: "absolute", top: "40%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center" }}>
            <div className="empty-icon" style={{ fontSize: 48, opacity: 0.3, marginBottom: 12 }}>○</div>
            <h3 style={{ fontSize: 16, color: "#c1c2c5", marginBottom: 4 }}>Data Flow Canvas</h3>
            <p style={{ fontSize: 13, color: "#909296" }}>Drag tables from the Schema Browser here.</p>
          </div>
          <Background />
          <Controls />
        </ReactFlow>
      </main>
    );
  }

  return (
    <main className="main-content">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
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
        <div className="message system"><strong>DataForge AI</strong><p>Connect to a database, then I can help you analyze schema and suggest data models.</p></div>
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
