import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, RefreshCw, Sparkles, X, Terminal, Workflow, ShieldAlert, FileText } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// Replay Types
export type WorkflowTraceEvent = {
    event_id: string;
    run_id: string;
    pulse_id: string | null;
    ts: string;
    type: string;
    from: string;
    to: string;
    title: string;
    payload?: any;
    parent_event_id?: string | null;
    severity?: string | null;
};

const SAMPLE_CONTRACT = `pragma solidity ^0.8.20;
contract DemoVault {
    mapping(address => uint256) public balances;
    function deposit() external payable { balances[msg.sender] += msg.value; }
    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "insufficient");
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
        balances[msg.sender] -= amount;
    }
}`;

const toActorId = (v: string) => String(v || 'system').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();

export function HKDemoStudio() {
    const timelineRef = useRef<HTMLDivElement | null>(null);
    const [baseUrl] = useState((import.meta as any).env.BASE_URL || '/');

    // UI State
    const [workflow, setWorkflow] = useState<any>({
        status: 'inactive',
        task_summary: { total: 11, pending: 11, running: 0, completed: 0, progress: 0 },
        event_dates: { start: '2026-02-11', end: '2026-02-12' }
    });
    const [scan, setScan] = useState<any>(null);
    const [report, setReport] = useState('');
    const [reportModalOpen, setReportModalOpen] = useState(false);
    const [contractPath] = useState('contracts/DemoVault.sol');
    const [busy, setBusy] = useState(false);
    const [runId, setRunId] = useState<string | null>(null);
    const [events, setEvents] = useState<WorkflowTraceEvent[]>([]);
    const [logs, setLogs] = useState<string[]>([]);
    const [allDemoEvents, setAllDemoEvents] = useState<WorkflowTraceEvent[]>([]);
    const [pulseIndex, setPulseIndex] = useState(0);

    const appendLog = useCallback((line: string) => {
        const stamp = new Date().toLocaleTimeString();
        setLogs((prev) => [`${stamp}  ${line}`, ...prev].slice(0, 30));
    }, []);

    // 1. Load Replay Artifacts
    useEffect(() => {
        const loadArtifacts = async () => {
            try {
                // Ensure base path ends with slash if not empty
                const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
                const jsonPath = `${cleanBase}demo_artifacts/run_events.json`;

                appendLog(`Attempting to load trace from: ${jsonPath}`);

                const resEvents = await fetch(jsonPath);
                if (resEvents.ok) {
                    const data = await resEvents.json();
                    setAllDemoEvents(Array.isArray(data) ? data : (data.events || []));
                    appendLog('Strategy trace artifacts loaded.');
                } else {
                    appendLog(`Failed to load trace: ${resEvents.status}`);
                }

                const reportPath = `${cleanBase}demo_artifacts/security_report.md`;
                const resReport = await fetch(reportPath);
                if (resReport.ok) setReport(await resReport.text());

            } catch (err) {
                console.error('Artifact load failed', err);
                appendLog('Critical error: Could not load replay artifacts.');
            }
        };
        loadArtifacts();
    }, [baseUrl, appendLog]);

    // Progress Logic
    const replayProgress = useCallback((currentPulse: number) => {
        const total = 11;
        const progress = Math.min(100, Math.round((currentPulse / total) * 100));
        setWorkflow((prev: any) => ({
            ...prev,
            task_summary: { total, completed: currentPulse, progress },
            status: progress === 100 ? 'completed' : 'active'
        }));
    }, []);

    const addEventsBatch = useCallback((batch: WorkflowTraceEvent[]) => {
        setEvents((prev) => {
            const existingIds = new Set(prev.map(e => e.event_id));
            const uniqueNew = batch.filter(e => !existingIds.has(e.event_id));
            return [...prev, ...uniqueNew].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
        });
        batch.forEach(e => appendLog(`[${e.type}] ${e.title}`));
    }, [appendLog]);

    // Replay Actions
    const runPulse = async () => {
        if (busy || pulseIndex >= 11) return;
        setBusy(true);
        const nextIdx = pulseIndex + 1;

        const pulseBatch = allDemoEvents.filter(e => {
            if (nextIdx === 1 && !e.pulse_id) return true;
            return e.pulse_id === `pulse_${nextIdx}`;
        });

        if (pulseBatch.length > 0) {
            addEventsBatch(pulseBatch);
        } else {
            appendLog(`Pulse ${nextIdx}: Trace point reached.`);
        }

        replayProgress(nextIdx);
        setPulseIndex(nextIdx);
        setBusy(false);
    };

    const runOneClick = async () => {
        if (busy) return;
        setBusy(true);
        setEvents([]);
        setPulseIndex(0);
        setRunId('run_static_replay_v2');
        setWorkflow((prev: any) => ({ ...prev, status: 'active' }));

        for (let i = 1; i <= 11; i++) {
            const batch = allDemoEvents.filter(e => {
                if (i === 1 && !e.pulse_id) return true;
                return e.pulse_id === `pulse_${i}`;
            });
            if (batch.length > 0) addEventsBatch(batch);
            replayProgress(i);
            setPulseIndex(i);
            await new Promise(r => setTimeout(r, 250));
        }

        appendLog('Consensus achieved. 100% Audit Complete.');
        setBusy(false);
    };

    const startScan = async () => {
        setBusy(true);
        setScan({ status: 'scanning', findings: [] });
        appendLog('DeFi Scanner Pulse initiated...');
        await new Promise(r => setTimeout(r, 1200));
        setScan({
            status: 'completed',
            findings: [
                { id: 'f1', title: 'Critical: Reentrancy Exposure', type: 'SWC-107' },
                { id: 'f2', title: 'High: Unprotected Withdrawal', type: 'Logic' }
            ]
        });
        appendLog('Scan complete. Risks identified.');
        setBusy(false);
    };

    // Unique Node/Edge IDs
    const allActors = useMemo(() => {
        const actors = new Set<string>();
        ['founder.panel', 'workflow.hk_consensus', 'workflow.orchestrator', 'agent.mesh', 'agent.orchestrator', 'governance.council', 'policy.center', 'workflow.executor', 'risk_guard', 'ops_guard'].forEach(a => actors.add(a));
        allDemoEvents.forEach(e => { if (e.from) actors.add(e.from); if (e.to) actors.add(e.to); });
        return Array.from(actors);
    }, [allDemoEvents]);

    const graphElements = useMemo(() => {
        const nodes: Node[] = allActors.map((a, i) => ({
            id: `node-${toActorId(a)}`,
            data: { label: a },
            position: { x: (i % 3) * 210, y: Math.floor(i / 3) * 110 },
            style: {
                background: '#0a0f1d', color: '#e2e8f0', border: '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: '8px', fontSize: '10px', width: 150, textAlign: 'center', padding: '10px', fontWeight: 'bold'
            },
        }));

        const lastEvt = events.length ? events[events.length - 1] : null;
        const edges: Edge[] = events.map((e, idx) => ({
            id: `edge-${e.event_id}-${idx}`,
            source: `node-${toActorId(e.from)}`,
            target: `node-${toActorId(e.to)}`,
            label: e.type,
            animated: e.event_id === lastEvt?.event_id,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: e.event_id === lastEvt?.event_id ? '#22c55e' : 'rgba(56, 189, 248, 0.4)', strokeWidth: e.event_id === lastEvt?.event_id ? 3 : 1 },
            labelStyle: { fill: '#94a3b8', fontSize: 9 }
        }));
        return { nodes, edges };
    }, [allActors, events]);

    const timelineGroups = useMemo(() => {
        const g = new Map<string, WorkflowTraceEvent[]>();
        for (const e of events) {
            const key = e.pulse_id || 'Initialization';
            if (!g.has(key)) g.set(key, []);
            g.get(key)?.push(e);
        }
        return Array.from(g.entries());
    }, [events]);

    const govEvents = useMemo(() => events.filter(e => ['agent_message', 'governance_vote', 'decision_finalized'].includes(e.type)), [events]);

    useEffect(() => {
        if (timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }, [events.length]);

    return (
        <div className="h-screen w-screen overflow-hidden bg-[#020617] text-slate-200">
            <div className="flex h-full flex-col font-sans">
                {/* Header */}
                <header className="flex items-center justify-between border-b border-white/5 bg-slate-950/50 backdrop-blur-xl px-6 py-4">
                    <div className="flex items-center gap-4">
                        <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400 border border-blue-400/20"><Workflow size={20} /></div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">Autonomous Security Governance</p>
                            <h1 className="text-xl font-bold tracking-tight">Daena Consensus <span className="text-slate-500 font-normal">| Hackathon Studio</span></h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={() => window.open('https://youtu.be/omzfIib2gkg', '_blank')} className="flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-xs font-bold text-blue-300 hover:bg-blue-500/20 transition-all"><Play size={14} /> Watch Demo</button>
                        <button onClick={() => window.location.reload()} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-400 hover:bg-white/10 transition-all"><RefreshCw size={14} /> Reset</button>
                    </div>
                </header>

                <main className="grid flex-1 grid-cols-12 gap-4 overflow-hidden p-4">
                    {/* LEFT PANEL */}
                    <section className="col-span-3 flex flex-col gap-4 min-h-0">
                        <div className="rounded-2xl border border-white/5 bg-slate-900/50 p-5 backdrop-blur-md">
                            <div className="flex items-center justify-between">
                                <span className={`rounded-md px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${workflow.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>{workflow.status}</span>
                                <span className="text-[10px] font-mono text-slate-500">{runId || 'OFFLINE'}</span>
                            </div>
                            <div className="mt-4 space-y-4">
                                <div>
                                    <div className="flex items-end justify-between mb-2">
                                        <p className="text-sm font-semibold text-slate-400">Progress</p>
                                        <p className="text-xl font-black text-slate-100">{workflow.task_summary.progress}%</p>
                                    </div>
                                    <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-blue-500 transition-all duration-700 ease-out" style={{ width: `${workflow.task_summary.progress}%` }} /></div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button disabled={busy} onClick={runOneClick} className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-bold text-white hover:bg-blue-500 transition-all disabled:opacity-50"><Sparkles size={16} /> One-Click Replay</button>
                                    <button disabled={busy || workflow.status === 'completed'} onClick={runPulse} className="rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-bold hover:bg-white/10 transition-all">Pulse</button>
                                    <button disabled={busy} onClick={() => { setEvents([]); setPulseIndex(0); setWorkflow({ status: 'inactive', task_summary: { total: 11, completed: 0, progress: 0 } }); }} className="rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-bold hover:bg-white/10 transition-all">Clear</button>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-1 flex-col rounded-2xl border border-white/5 bg-slate-900/50 backdrop-blur-md overflow-hidden">
                            <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-4 py-3">
                                <h3 className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase"><FileText size={14} /> Security Report</h3>
                                <button disabled={!report} onClick={() => setReportModalOpen(true)} className="rounded-lg bg-emerald-500/10 px-3 py-1 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-30">FULL VIEW</button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 text-[13px] leading-6 text-slate-300 font-mono">
                                {report ? report.split('\n').slice(0, 30).map((l, i) => <p key={i} className={l.startsWith('#') ? 'font-black text-blue-400' : ''}>{l || '\u00A0'}</p>) : <p className="text-slate-500 italic mt-10 text-center">Scan required.</p>}
                            </div>
                        </div>
                    </section>

                    {/* CENTER PANEL */}
                    <section className="col-span-3 flex flex-col gap-4 min-h-0">
                        <div className="flex flex-1 flex-col rounded-2xl border border-white/5 bg-black/40 backdrop-blur-md overflow-hidden">
                            <div className="flex-1 min-h-0 relative">
                                <Editor height="100%" language="sol" theme="vs-dark" value={SAMPLE_CONTRACT} options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }} />
                            </div>
                            <div className="p-4 bg-slate-950/50 border-t border-white/5">
                                <button disabled={busy} onClick={startScan} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 font-bold text-white hover:bg-indigo-500 transition-all disabled:opacity-50"><ShieldAlert size={16} /> Run Consensus Scan</button>
                                <div className="mt-3 min-h-20 space-y-2">
                                    {scan?.findings?.map((f: any) => (
                                        <div key={f.id} className="rounded-lg border border-red-500/20 bg-red-500/5 p-2 animate-in slide-in-from-left">
                                            <p className="text-xs font-bold text-red-300">{f.title}</p>
                                        </div>
                                    )) || (scan?.status === 'scanning' ? <p className="text-center py-4 text-xs text-blue-400 animate-pulse">Analyzing...</p> : null)}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-white/5 bg-slate-900/50 p-4">
                            <h3 className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase mb-3"><Terminal size={14} /> Agent Transaction Log</h3>
                            <div className="h-32 overflow-y-auto space-y-1 font-mono text-[11px] text-slate-400 custom-scrollbar">
                                {logs.map((l, i) => <p key={i} className="border-l border-blue-500/20 pl-2 opacity-80">{l}</p>)}
                            </div>
                        </div>
                    </section>

                    {/* RIGHT PANEL */}
                    <section className="col-span-6 flex flex-col gap-4 min-h-0">
                        <div className="flex-1 grid grid-rows-2 gap-4 min-h-0">
                            <div className="relative rounded-2xl border border-white/10 bg-black/60 overflow-hidden">
                                <ReactFlow nodes={graphElements.nodes} edges={graphElements.edges} fitView nodesDraggable={false} nodesConnectable={false}>
                                    <Background color="#1e293b" gap={20} size={1} />
                                    <Controls showInteractive={false} />
                                </ReactFlow>
                            </div>

                            <div className="grid grid-cols-2 gap-4 min-h-0">
                                <div className="flex flex-col rounded-2xl border border-white/5 bg-slate-900/50 backdrop-blur-md overflow-hidden">
                                    <div className="bg-white/5 px-4 py-3 border-b border-white/5 text-xs font-bold text-slate-400 uppercase tracking-widest">Timeline</div>
                                    <div ref={timelineRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                                        {timelineGroups.map(([g, items]) => (
                                            <div key={g} className="space-y-2">
                                                <p className="text-[9px] font-black text-blue-500/50 uppercase tracking-widest border-b border-white/5 pb-1">{g}</p>
                                                {items.map((e, idx) => (
                                                    <div key={`${e.event_id}-${idx}`} className="rounded-xl bg-white/5 p-3 border border-white/5">
                                                        <p className="text-xs font-bold text-slate-200">{e.title}</p>
                                                        <p className="text-[10px] text-slate-500 font-mono mt-1">{e.from} → {e.to}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex flex-col rounded-2xl border border-white/5 bg-slate-900/50 backdrop-blur-md overflow-hidden">
                                    <div className="bg-white/5 px-4 py-3 border-b border-white/5 text-xs font-bold text-slate-400 uppercase tracking-widest">Governance Debate</div>
                                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                                        {govEvents.map((e, idx) => (
                                            <div key={`${e.event_id}-${idx}`} className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
                                                <p className="text-xs font-bold text-blue-100 mb-1">{e.title}</p>
                                                <p className="text-[11px] text-slate-400 italic leading-relaxed">{e.payload?.rationale || e.payload?.message}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </main>
            </div>

            {/* Modal */}
            {reportModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-3xl">
                    <div className="flex h-full w-full max-w-5xl flex-col rounded-3xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between border-b border-white/10 px-8 py-5">
                            <h2 className="text-xl font-black text-slate-100">Final Security Consensus Report</h2>
                            <button onClick={() => setReportModalOpen(false)} className="rounded-full bg-white/5 p-3 hover:bg-white/10"><X size={20} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-10 py-8 font-mono text-[15px] leading-8 text-slate-300 custom-scrollbar whitespace-pre-wrap">
                            {report}
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{ __html: `.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(59, 130, 246, 0.2); border-radius: 10px; }` }} />
        </div>
    );
}
