import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, Play, RefreshCw, Sparkles, X, ChevronDown } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// Replay Types (Adapted for Static Mode)
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
const ts = (v: string) => new Date(v || '').getTime() || 0;

export function HKDemoStudio() {
    // State
    const timelineRef = useRef<HTMLDivElement | null>(null);
    const [baseUrl] = useState('./');

    // UI State (Matches Original)
    const [workflow, setWorkflow] = useState<any>({
        status: 'inactive',
        task_summary: { total: 11, pending: 11, running: 0, completed: 0, progress: 0 },
        event_dates: { start: '2026-02-10', end: '2026-02-12' }
    });
    const [defiHealth, setDefiHealth] = useState<any>({ slither: { installed: true } });
    const [vision, setVision] = useState<any>({ success: true, ready: true, sources_count: 1 });
    const [scan, setScan] = useState<any>(null);
    const [scanId, setScanId] = useState<string | null>(null);
    const [report, setReport] = useState('');
    const [reportModalOpen, setReportModalOpen] = useState(false);
    const [mode, setMode] = useState<'path' | 'inline'>('path');
    const [codeEditable, setCodeEditable] = useState(false);
    const [contractPath, setContractPath] = useState('contracts/DemoVault.sol');
    const [inlineCode, setInlineCode] = useState(SAMPLE_CONTRACT);
    const [busy, setBusy] = useState(false);
    const [runId, setRunId] = useState<string | null>(null);
    const [events, setEvents] = useState<WorkflowTraceEvent[]>([]);
    const [logs, setLogs] = useState<string[]>([]);

    // Static Replay State
    const [allDemoEvents, setAllDemoEvents] = useState<WorkflowTraceEvent[]>([]);
    const [availableRuns, setAvailableRuns] = useState<string[]>(['run_events.json']);
    const [selectedRun, setSelectedRun] = useState('run_events.json');

    const appendLog = useCallback((line: string) => {
        const stamp = new Date().toLocaleTimeString();
        setLogs((prev) => [`${stamp}  ${line}`, ...prev].slice(0, 20));
    }, []);

    const codeContent = useMemo(() => (
        mode === 'inline'
            ? inlineCode
            : `// Path mode preview\n// Scan target: ${contractPath}\n\n${inlineCode}`
    ), [mode, inlineCode, contractPath]);

    // 1. Load Replay Artifacts & Manifest (Static Logic)
    useEffect(() => {
        const loadArtifacts = async () => {
            try {
                const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

                // Load Manifest
                if (availableRuns.length <= 1) {
                    try {
                        const resManifest = await fetch(`${cleanBase}demo_artifacts/manifest.json`);
                        if (resManifest.ok) {
                            const list = await resManifest.json();
                            if (Array.isArray(list)) setAvailableRuns(list.sort());
                        }
                    } catch (e) {
                        console.warn('Manifest load failed', e);
                    }
                }

                // Fetch Selected Trace
                const jsonUrl = `${cleanBase}demo_artifacts/${selectedRun}`;
                const resEvents = await fetch(jsonUrl);
                if (resEvents.ok) {
                    const data = await resEvents.json();
                    const rawEvents = Array.isArray(data) ? data : (data.events || []);
                    setAllDemoEvents(rawEvents);
                    appendLog(`Activated Trace: ${selectedRun} (${rawEvents.length} events)`);
                } else {
                    appendLog(`Failed to load trace: ${selectedRun}`);
                }

                // Fetch Report (Pre-load)
                const reportUrl = `${cleanBase}demo_artifacts/security_report.md`;
                const resReport = await fetch(reportUrl);
                if (resReport.ok) {
                    const text = await resReport.text();
                    // We don't set report state immediately, we wait for "buildReport"
                    // But for static demo, we can store it in a temp variable or just fetch again
                }

            } catch (err) {
                console.error('Artifact load failed', err);
                appendLog('Error: Could not load replay artifacts.');
            }
        };
        loadArtifacts();
    }, [baseUrl, appendLog, selectedRun, availableRuns.length]);

    // 2. Report View Logic
    const visibleReport = report.length > 12000 ? `${report.slice(0, 12000)}\n\n[Preview truncated.]` : report;
    const readableReport = useMemo(
        () => visibleReport
            .replace(/\r\n/g, '\n')
            .replace(/\*\*/g, '')
            .replace(/`/g, '')
            .replace(/^#{1,6}\s*/gm, '')
            .replace(/^\s*-\s+/gm, '- '),
        [visibleReport]
    );
    const reportLines = useMemo(() => readableReport.split('\n'), [readableReport]);

    // 3. Replay Logic (Static)
    const addEventsBatch = useCallback((batch: WorkflowTraceEvent[]) => {
        setEvents((prev) => {
            const existingIds = new Set(prev.map(e => e.event_id));
            const uniqueNew = batch.filter(e => !existingIds.has(e.event_id));
            return [...prev, ...uniqueNew].sort((a, b) => ts(a.ts) - ts(b.ts));
        });
        batch.forEach(e => appendLog(`[${e.type}] ${e.title}`));
    }, [appendLog]);

    const runOneClick = async () => {
        if (busy) return;
        setBusy(true);
        setEvents([]);
        const newRunId = selectedRun.replace('.json', '');
        setRunId(newRunId);
        setWorkflow((prev: any) => ({ ...prev, status: 'active', task_summary: { ...prev.task_summary, progress: 0 } }));

        const totalPulses = 11;
        for (let i = 1; i <= totalPulses; i++) {
            const batch = allDemoEvents.filter(e => {
                if (i === 1 && !e.pulse_id) return true;
                return e.pulse_id === `pulse_${i}`;
            });

            if (batch.length > 0) {
                addEventsBatch(batch);
                await new Promise(r => setTimeout(r, 400));
            } else {
                appendLog(`Advancing pulse ${i}...`);
                await new Promise(r => setTimeout(r, 150));
            }

            // Update Progress
            const progress = Math.min(100, Math.round((i / totalPulses) * 100));
            setWorkflow((prev: any) => ({
                ...prev,
                task_summary: {
                    total: totalPulses,
                    completed: i,
                    progress
                },
                status: progress === 100 ? 'completed' : 'active'
            }));
        }

        appendLog('Strategic consensus achieved. System final 100%.');
        setBusy(false);
    };

    const activateWorkflow = async () => {
        setBusy(true);
        appendLog('Simulating activation...');
        await new Promise(r => setTimeout(r, 800));
        setWorkflow((prev: any) => ({ ...prev, status: 'active' }));
        setRunId('run_manual_activation');
        setBusy(false);
    };

    const runPulse = async () => {
        if (busy) return;
        setBusy(true);
        appendLog('Executing single pulse...');
        await new Promise(r => setTimeout(r, 500));
        addEventsBatch(allDemoEvents.slice(events.length, events.length + 5));
        setWorkflow((prev: any) => ({ ...prev, status: 'active' }));
        setBusy(false);
    };

    const resetWorkflow = async () => {
        setBusy(true);
        setEvents([]);
        setReport('');
        setScan(null);
        setScanId(null);
        setWorkflow({
            status: 'inactive',
            task_summary: { total: 11, pending: 11, running: 0, completed: 0, progress: 0 },
            event_dates: { start: '2026-02-10', end: '2026-02-12' }
        });
        setRunId(null);
        appendLog('Workflow reset.');
        setBusy(false);
    };

    const startScan = async () => {
        setBusy(true);
        setScanId('scan_' + Math.random().toString(36).substr(2, 9));
        setScan({ status: 'scanning', findings: [] });
        appendLog('DeFi Scanner (Static) initiated...');
        await new Promise(r => setTimeout(r, 1500));
        setScan({
            status: 'completed',
            findings: [
                { id: 'f1', title: 'Critical: Reentrancy Exposure', severity: 'Critical' },
                { id: 'f2', title: 'High: Unprotected Withdrawal', severity: 'High' }
            ]
        });
        appendLog('Scan complete.');
        setBusy(false);
    };

    const buildReport = async () => {
        setBusy(true);
        try {
            const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
            const reportUrl = `${cleanBase}demo_artifacts/security_report.md`;
            const resReport = await fetch(reportUrl);
            if (resReport.ok) {
                const text = await resReport.text();
                setReport(text);
                setReportModalOpen(true);
                appendLog('Report generated from verified ledger.');
            } else {
                appendLog('Error: Report artifact missing.');
            }
        } catch (e) {
            appendLog('Error loading report.');
        }
        setBusy(false);
    };

    const timelineGroups = useMemo(() => {
        const g = new Map<string, WorkflowTraceEvent[]>();
        for (const e of events) {
            const key = e.pulse_id || 'run';
            if (!g.has(key)) g.set(key, []);
            g.get(key)?.push(e);
        }
        return Array.from(g.entries());
    }, [events]);

    const govEvents = useMemo(() => events.filter((e) => ['agent_message', 'governance_vote', 'decision_finalized'].includes(e.type)), [events]);

    // Graph Logic (Original)
    const graph = useMemo(() => {
        const actors: string[] = [];
        const seen = new Set<string>();
        for (const e of events) {
            [e.from, e.to].forEach((a) => {
                if (a && !seen.has(a)) {
                    seen.add(a);
                    actors.push(a);
                }
            });
        }
        const nodes: Node[] = actors.map((a, i) => ({
            id: toActorId(a),
            data: { label: a },
            position: { x: 60 + (i % 4) * 220, y: 50 + Math.floor(i / 4) * 110 },
            draggable: false,
            selectable: false,
            style: { background: '#0e1b35', color: '#dbe7ff', border: '1px solid rgba(86,136,255,0.45)', borderRadius: 10, fontSize: 12, width: 150, textAlign: 'center' },
        }));
        const last = events.length ? events[events.length - 1].event_id : '';
        const edges: Edge[] = events.map((e, idx) => ({
            id: e.event_id || `edge-${idx}`,
            source: toActorId(e.from),
            target: toActorId(e.to),
            label: e.type,
            animated: e.event_id === last,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: e.event_id === last ? '#10b981' : '#5b7fff', strokeWidth: e.event_id === last ? 2.2 : 1.3 },
            labelStyle: { fill: '#9db5ff', fontSize: 11 },
        }));
        return { nodes, edges };
    }, [events]);

    useEffect(() => {
        const el = timelineRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [events.length]);

    // RENDER (Original UI with Selectors injected)
    return (
        <div className="h-screen w-screen overflow-hidden bg-[#050814] text-white font-sans">
            <div className="flex h-full flex-col">
                <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <div className="flex items-center gap-2">
                        <button className="rounded-md border border-white/20 bg-white/5 p-2" disabled><ArrowLeft size={14} /></button>
                        <div><p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">Daena Demo Studio</p><h1 className="text-lg font-semibold">HK Consensus One-Page Demo</h1></div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => window.open('https://youtu.be/omzfIib2gkg', '_blank')} className="hidden rounded-md border border-white/20 bg-white/5 px-3 py-2 text-xs md:block"><span className="inline-flex items-center gap-1"><Play size={12} /> Watch Demo</span></button>
                        <button onClick={() => window.location.reload()} className="rounded-md border border-white/20 bg-white/5 px-3 py-2 text-xs"><span className="inline-flex items-center gap-1"><RefreshCw size={12} /> Refresh</span></button>
                    </div>
                </header>

                <main className="grid h-[calc(100vh-62px)] grid-cols-1 gap-3 overflow-hidden p-3 xl:grid-cols-12">
                    {/* LEFT COLUMN: WORKFLOW */}
                    <section className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-black/30 p-4 text-base xl:col-span-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Workflow</p>
                        <p className="mt-1 text-2xl font-semibold">{workflow?.status || 'inactive'}</p>
                        <p className="text-sm text-gray-400">{workflow?.event_dates?.start} to {workflow?.event_dates?.end}</p>
                        <div className="mt-2 rounded border border-white/10 bg-black/40 px-3 py-2 text-xs text-cyan-200">Run ID: {runId || 'not started'}</div>

                        {/* INJECTED: Multi-Trace Selector */}
                        <div className="mt-2">
                            <div className="relative">
                                <select
                                    className="w-full appearance-none rounded border border-white/10 bg-slate-900 px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-cyan-500"
                                    value={selectedRun}
                                    onChange={(e) => {
                                        setSelectedRun(e.target.value);
                                        setEvents([]);
                                        setWorkflow({ ...workflow, status: 'inactive', task_summary: { ...workflow.task_summary, progress: 0 } });
                                        setRunId(null);
                                    }}
                                >
                                    {availableRuns.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2 top-2.5 text-gray-500 pointer-events-none" size={12} />
                            </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                            <div className="rounded-lg border border-white/10 bg-black/40 p-2">Tasks: {workflow?.task_summary?.total ?? 0}</div>
                            <div className="rounded-lg border border-white/10 bg-black/40 p-2">Running: {workflow?.task_summary?.running ?? 0}</div>
                            <div className="rounded-lg border border-white/10 bg-black/40 p-2">Completed: {workflow?.task_summary?.completed ?? 0}</div>
                            <div className="rounded-lg border border-white/10 bg-black/40 p-2">Progress: {workflow?.task_summary?.progress ?? 0}%</div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                            <button disabled={busy} onClick={() => void runOneClick()} className="rounded-md bg-emerald-600 px-3 py-2 font-semibold disabled:bg-gray-700 shadow-lg shadow-emerald-900/40"><span className="inline-flex items-center gap-1"><Sparkles size={14} /> One-Click Run</span></button>
                            <button disabled={busy} onClick={() => void activateWorkflow()} className="rounded-md bg-cyan-600 px-3 py-2 font-semibold disabled:bg-gray-700">Activate</button>
                            <button disabled={busy || workflow?.status !== 'active'} onClick={() => void runPulse()} className="rounded-md bg-amber-600/70 px-3 py-2 font-semibold disabled:bg-gray-700">Run Pulse</button>
                            <button disabled={busy} onClick={() => void resetWorkflow()} className="rounded-md bg-red-700/70 px-3 py-2 font-semibold disabled:bg-gray-700">Reset</button>
                        </div>
                        <div className="mt-3 flex min-h-0 flex-1 flex-col rounded border border-white/10 bg-black/40 p-3">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-gray-100">Report Review</p>
                                <span className="text-xs text-gray-400">{report ? `${report.length} chars` : 'empty'}</span>
                            </div>
                            <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-white/10 bg-black/50 p-3">
                                <div className="min-h-0 flex-1 overflow-y-auto space-y-1 text-sm leading-7 text-gray-200">
                                    {report
                                        ? reportLines.slice(0, 40).map((line, idx) => (
                                            <p key={`${idx}-${line}`} className={line.includes(':') ? 'font-semibold text-cyan-100' : ''}>{line || '\u00A0'}</p>
                                        ))
                                        : <p className="text-gray-400">Generate report after completed scan.</p>}
                                </div>
                                <button
                                    disabled={!report}
                                    onClick={() => setReportModalOpen(true)}
                                    className="mt-2 rounded border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    View Full Report Popup
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* MIDDLE COLUMN: DEFI SECURITY */}
                    <section className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-black/30 p-4 text-base xl:col-span-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-indigo-200">DeFi Security</p>
                        <p className="mt-1 text-sm text-gray-300">Slither: {defiHealth?.slither?.installed ? 'Ready' : 'Missing'}</p>
                        <div className="mt-2 flex gap-2 text-sm">
                            <button onClick={() => setMode('path')} className={`rounded px-2 py-1 ${mode === 'path' ? 'bg-cyan-600' : 'bg-white/10'}`}>Path</button>
                            <button onClick={() => setMode('inline')} className={`rounded px-2 py-1 ${mode === 'inline' ? 'bg-cyan-600' : 'bg-white/10'}`}>Inline</button>
                        </div>
                        <input value={contractPath} onChange={(e) => setContractPath(e.target.value)} className="mt-2 rounded border border-white/20 bg-black/50 px-3 py-3 text-base font-semibold text-white focus:outline-none focus:border-cyan-500" />
                        <div className="mt-2 overflow-hidden rounded border border-white/15 bg-[#0a1024]">
                            <Editor height="250px" language="sol" theme="vs-dark" value={codeContent} onChange={(v) => { if (mode === 'inline' && codeEditable) setInlineCode(v ?? ''); }} options={{ readOnly: mode === 'path' || !codeEditable, minimap: { enabled: false }, lineNumbers: 'on', wordWrap: 'on', fontSize: 13, lineHeight: 22, automaticLayout: true }} />
                        </div>
                        <button disabled={busy} onClick={() => void startScan()} className="mt-2 rounded bg-indigo-600 px-3 py-2 text-sm font-semibold disabled:bg-gray-700 hover:bg-indigo-500 transition-all"><span className="inline-flex items-center gap-1"><Play size={13} /> Start Scan</span></button>
                        <div className="mt-2 rounded border border-white/10 bg-black/40 p-2 text-sm">Scan: {scanId || 'none'} ({scan?.status || 'idle'})</div>
                        <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded border border-white/10 bg-black/40 p-2 text-sm">{(scan?.findings || []).length === 0 ? <p className="text-gray-500">No findings yet.</p> : scan?.findings?.slice(0, 8).map((f: any) => <div key={f.id} className="mb-1 rounded border border-white/10 bg-black/50 p-2"><p className="font-semibold">{f.title}</p><p className="text-gray-400">{f.severity}</p></div>)}</div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                            <button disabled={!scanId || scan?.status !== 'completed'} onClick={() => void buildReport()} className="rounded bg-emerald-700 px-3 py-2 text-sm font-semibold disabled:bg-gray-700 hover:bg-emerald-600 transition-all">Generate Report</button>
                            <button disabled={!report} onClick={() => setReportModalOpen(true)} className="rounded border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-cyan-500/20 transition-all">View Report</button>
                        </div>
                    </section>

                    {/* RIGHT COLUMN: LIVE READINESS & GRAPH */}
                    <section className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-black/30 p-4 text-base xl:col-span-6">
                        <p className="text-xs uppercase tracking-[0.18em] text-emerald-200">Live Readiness</p>
                        <div className="mt-2 rounded border border-white/10 bg-black/40 px-3 py-2 text-sm">
                            <div className="flex items-center gap-4 overflow-x-auto whitespace-nowrap">
                                <span>Workflow active: <span className="text-cyan-200">{workflow?.status === 'active' ? 'Yes' : 'No'}</span></span>
                                <span>DaenaVision ready: <span className="text-cyan-200">{vision.ready ? 'Yes' : 'No'}</span></span>
                                <span>Vision sources: <span className="text-cyan-200">{vision?.sources_count ?? 0}</span></span>
                            </div>
                        </div>
                        <div className="mt-3 flex min-h-0 flex-1 flex-col rounded border border-white/10 bg-black/40 p-2">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-gray-100">Live Workflow</p>
                                <span className="text-[11px] text-cyan-300">{events.length} events</span>
                            </div>
                            <div className="mt-2 grid min-h-0 flex-1 grid-cols-5 grid-rows-2 gap-2">
                                <div className="col-span-3 row-span-2 flex min-h-0 flex-col rounded border border-white/10 bg-black/45 p-2">
                                    <p className="text-[11px] uppercase tracking-wider text-cyan-300">Call Graph</p>
                                    <div className="mt-2 min-h-0 flex-1">
                                        <ReactFlow nodes={graph.nodes} edges={graph.edges} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}>
                                            <Background color="#1e293b" gap={20} size={1} />
                                            <Controls showInteractive={false} />
                                        </ReactFlow>
                                    </div>
                                </div>
                                <div className="col-span-2 flex min-h-0 flex-col rounded border border-white/10 bg-black/45 p-2">
                                    <p className="text-[11px] uppercase tracking-wider text-cyan-300">Timeline</p>
                                    <div ref={timelineRef} className="mt-2 min-h-0 flex-1 overflow-y-auto space-y-2 text-xs">
                                        {timelineGroups.length === 0 ? <p className="text-xs text-gray-500">Run One-Click or Pulse to view timeline.</p> : timelineGroups.map(([g, items]) => <div key={g} className="rounded border border-white/10 bg-black/30 p-2"><p className="text-[10px] uppercase tracking-wider text-cyan-300">{g}</p>{items.map((e) => <div key={e.event_id} className="mt-1 rounded border border-white/10 bg-black/30 px-2 py-1"><p className="text-xs">{e.title}</p><p className="text-[10px] text-gray-400">{e.from} -&gt; {e.to} · {e.type}</p></div>)}</div>)}</div>
                                </div>
                                <div className="col-span-2 flex min-h-0 flex-col rounded border border-white/10 bg-black/45 p-2">
                                    <p className="text-[11px] uppercase tracking-wider text-cyan-300">Debate + Governance</p>
                                    <div className="mt-2 min-h-0 flex-1 overflow-y-auto space-y-2 text-xs">
                                        {govEvents.length === 0 ? <p className="text-xs text-gray-500">No debate/governance events yet.</p> : govEvents.map((e) => <div key={e.event_id} className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs font-semibold">{e.title}</p><p className="text-[10px] text-gray-400">{e.type} · {e.from} -&gt; {e.to}</p>{e.payload?.message && <p className="mt-1 text-xs text-gray-300">{String(e.payload.message)}</p>}{Array.isArray(e.payload?.votes) && e.payload.votes.map((v: any, i: number) => <p key={`${e.event_id}-${i}`} className="text-[11px] text-gray-300">{v.member}: <span className="text-cyan-300">{v.vote}</span></p>)}{e.payload?.rationale && <p className="mt-1 text-[11px] text-emerald-200">{String(e.payload.rationale)}</p>}</div>)}</div>
                                </div>
                            </div>
                        </div>
                        <div className="mt-2 rounded border border-white/10 bg-black/40 p-2">
                            <p className="text-xs uppercase tracking-wider text-slate-300">Event Log</p>
                            <div className="mt-1 h-32 overflow-y-auto text-xs text-gray-300">{logs.length === 0 ? <p className="text-gray-500">No events yet.</p> : logs.map((l) => <p key={l} className="mb-1">{l}</p>)}</div>
                        </div>
                    </section>
                </main>

                {reportModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
                        <div className="flex h-[88vh] w-full max-w-5xl flex-col rounded-2xl border border-white/20 bg-[#0a1229] shadow-2xl">
                            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Report Viewer</p>
                                    <p className="text-lg font-semibold text-white">Security Scan Report</p>
                                </div>
                                <button onClick={() => setReportModalOpen(false)} className="rounded border border-white/20 bg-white/5 p-2 text-white hover:bg-white/10">
                                    <X size={16} />
                                </button>
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                                {!report && <p className="text-base text-gray-300">Generate a report first to view it here.</p>}
                                {report && (
                                    <div className="space-y-1 text-[15px] leading-8 text-gray-100">
                                        {reportLines.map((line, idx) => (
                                            <p key={`${idx}-${line}`} className={line.includes(':') ? 'font-semibold text-cyan-100' : ''}>
                                                {line || '\u00A0'}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center justify-between border-t border-white/10 px-5 py-3">
                                <span className="text-xs text-gray-400">{report ? `${report.length} chars` : 'No report loaded'}</span>
                                <button onClick={() => setReportModalOpen(false)} className="rounded bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500">Close</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
