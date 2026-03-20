import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Plus, X, Play, Cpu, RefreshCw, Download, Lightbulb,
  Square, Terminal, ChevronRight, Loader,
} from 'lucide-react'

// ─── Data ────────────────────────────────────────────────────────────────────

const PLAYBOOKS = [
  { name: 'linux-baseline',    desc: 'Full Linux CIS baseline audit (12 modules)' },
  { name: 'ssh-hardening',     desc: 'SSH daemon configuration review' },
  { name: 'network-exposure',  desc: 'Open ports and firewall state review' },
  { name: 'user-accounts',     desc: 'User account and privilege audit' },
  { name: 'file-permissions',  desc: 'World-writable and SUID/SGID scan' },
]

const MODULES = [
  { name: 'system.kernel_params',    desc: 'Kernel sysctl parameter checks' },
  { name: 'system.user_accounts',    desc: 'User account security review' },
  { name: 'system.file_permissions', desc: 'File permission auditing' },
  { name: 'network.open_ports',      desc: 'Listening port enumeration' },
  { name: 'network.firewall_state',  desc: 'Firewall configuration check' },
  { name: 'auth.ssh_config',         desc: 'SSH daemon configuration audit' },
  { name: 'auth.pam_config',         desc: 'PAM authentication configuration' },
  { name: 'software.package_versions', desc: 'Outdated package detection' },
  { name: 'software.service_config', desc: 'Running service configuration review' },
  { name: 'secrets.env_files',       desc: 'Exposed credentials in env files' },
  { name: 'secrets.key_files',       desc: 'SSH key and certificate exposure scan' },
]

const BLOCKED_PATTERNS = [
  /\bshell\b/, /\bbash\b/, /\bsh\b/, /\bexec\b/, /\beval\b/, /\bsudo\b/,
  /\brm\s/, /\bcurl\b/, /\bwget\b/, /\bnc\b/, /\bnetcat\b/, /\bpython\b/,
  /\bperl\b/, /\bruby\b/, /\/bin\//, /\/etc\//, /\.\.\//,
  /[;&`]/, /\|\|/, /&&/, />>/, /<</, /\$\(/, /\$\{/,
]

// ─── Parser ──────────────────────────────────────────────────────────────────

function parseCommand(input) {
  const trimmed = input.trim()
  if (!trimmed) return null

  const lower = trimmed.toLowerCase()
  for (const p of BLOCKED_PATTERNS) {
    if (p.test(lower)) {
      return { error: 'Command blocked: unsafe pattern detected. Type "help" for available commands.' }
    }
  }

  const tokens = trimmed.split(/\s+/)
  const verb = tokens[0].toLowerCase()
  const ALLOWED = ['run', 'show', 'export', 'refresh', 'suggest', 'cancel', 'clear', 'help']
  if (!ALLOWED.includes(verb)) {
    return { error: `Unknown command: "${verb}". Type "help" to see available commands.` }
  }

  if (verb === 'help')    return { type: 'help', topic: tokens[1]?.toLowerCase() || null }
  if (verb === 'clear')   return { type: 'clear' }
  if (verb === 'cancel')  return { type: 'cancel' }
  if (verb === 'refresh') return { type: 'task', task: 'refresh_findings' }
  if (verb === 'suggest') return { type: 'task', task: 'suggest_checks' }

  if (verb === 'run') {
    const noun = tokens[1]?.toLowerCase()
    if (!noun) return { error: 'Usage: run playbook <name> | run module <module.name>' }
    if (noun === 'playbook') {
      const name = tokens[2]
      if (!name) return { error: `Usage: run playbook <name>\nAvailable: ${PLAYBOOKS.map(p => p.name).join(', ')}` }
      if (!PLAYBOOKS.find(p => p.name === name)) {
        return { error: `Playbook not found: "${name}". Run "show playbooks" to see available playbooks.` }
      }
      return {
        type: 'task', task: 'run_playbook', playbook: name,
        dryRun: tokens.includes('--dry-run'),
        verbose: tokens.includes('--verbose'),
      }
    }
    if (noun === 'module') {
      const name = tokens[2]
      if (!name) return { error: 'Usage: run module <module.name>  (e.g. auth.ssh_config)' }
      if (!/^[a-z_]+\.[a-z_]+$/.test(name)) {
        return { error: `Invalid module name: "${name}". Format must be: category.name` }
      }
      if (!MODULES.find(m => m.name === name)) {
        return { error: `Module not found: "${name}". Run "show modules" to list available modules.` }
      }
      return { type: 'task', task: 'run_module', module: name, verbose: tokens.includes('--verbose') }
    }
    return { error: `Unknown target: "${noun}". Usage: run playbook <name> | run module <module.name>` }
  }

  if (verb === 'show') {
    const noun = tokens[1]?.toLowerCase()
    if (!noun) return { error: 'Usage: show findings [severity] | show assessments | show runs | show playbooks | show modules' }
    const valid = ['findings', 'assessments', 'runs', 'playbooks', 'modules']
    if (!valid.includes(noun)) return { error: `Unknown: "${noun}". Use: ${valid.join(', ')}` }
    return { type: 'query', query: noun, filter: noun === 'findings' ? tokens[2]?.toLowerCase() || null : null }
  }

  if (verb === 'export') {
    const noun = tokens[1]?.toLowerCase()
    if (noun !== 'report') return { error: 'Usage: export report <html|markdown|json>' }
    const fmt = tokens[2]?.toLowerCase()
    const FMTS = ['html', 'markdown', 'json']
    if (!fmt || !FMTS.includes(fmt)) return { error: `Usage: export report <format>  Formats: ${FMTS.join(', ')}` }
    return { type: 'task', task: 'generate_report', format: fmt }
  }

  return { error: 'Unhandled command. Type "help" for usage.' }
}

// ─── Query executor (client-side, no API) ────────────────────────────────────

const SEV_COLORS = { critical: '#E5534B', high: '#F5A623', medium: '#F5D623', low: '#4F8EF7', info: '#9CA3AF' }

function executeQuery(parsed) {
  if (parsed.query === 'playbooks') {
    return [
      { text: 'Available playbooks:', color: '#4F8EF7' },
      ...PLAYBOOKS.map(p => ({ text: `  ${p.name.padEnd(22)} ${p.desc}`, color: '#9CA3AF' })),
    ]
  }
  if (parsed.query === 'modules') {
    return [
      { text: 'Available modules:', color: '#4F8EF7' },
      ...MODULES.map(m => ({ text: `  ${m.name.padEnd(30)} ${m.desc}`, color: '#9CA3AF' })),
    ]
  }
  if (parsed.query === 'findings') {
    const all = [
      { sev: 'critical', title: 'Root login permitted via SSH' },
      { sev: 'critical', title: 'Empty password account detected: backup' },
      { sev: 'high',     title: 'Weak SSH ciphers enabled (arcfour, 3des-cbc)' },
      { sev: 'high',     title: 'World-writable directory: /var/tmp/uploads' },
      { sev: 'high',     title: 'SUID binary outside standard paths: /opt/legacy/bin/app' },
      { sev: 'medium',   title: 'SSH banner not configured' },
      { sev: 'medium',   title: 'iptables rules not persistent across reboots' },
      { sev: 'medium',   title: 'Cron jobs writable by non-root user' },
      { sev: 'low',      title: 'SSH idle timeout not configured (ClientAliveInterval)' },
      { sev: 'low',      title: 'System timezone not set to UTC' },
      { sev: 'info',     title: 'SSH protocol version 1 not explicitly disabled' },
    ]
    const f = parsed.filter ? all.filter(x => x.sev === parsed.filter) : all
    if (f.length === 0) return [{ text: `No findings with severity: ${parsed.filter}`, color: '#6B7280' }]
    return [
      { text: `Findings${parsed.filter ? ` — ${parsed.filter.toUpperCase()}` : ''} (${f.length} result${f.length !== 1 ? 's' : ''}):`, color: '#4F8EF7' },
      ...f.map(x => ({ text: `  [${x.sev.toUpperCase().padEnd(8)}] ${x.title}`, color: SEV_COLORS[x.sev] })),
    ]
  }
  if (parsed.query === 'assessments') {
    const all = [
      { name: 'Web Application Audit',    status: 'active',   findings: 12 },
      { name: 'Internal Network Scan',    status: 'complete', findings: 7 },
      { name: 'Linux Server Hardening',   status: 'active',   findings: 15 },
      { name: 'SSH Configuration Review', status: 'complete', findings: 4 },
      { name: 'File Permission Audit',    status: 'draft',    findings: 0 },
    ]
    return [
      { text: 'Assessments:', color: '#4F8EF7' },
      ...all.map(a => ({
        text: `  ${a.name.padEnd(32)} ${a.status.padEnd(10)} ${a.findings} findings`,
        color: a.status === 'active' ? '#E8EAF0' : '#9CA3AF',
      })),
    ]
  }
  if (parsed.query === 'runs') {
    const all = [
      { assessment: 'Linux Server Hardening',   date: '2026-03-19 08:00', status: 'complete', findings: 15 },
      { assessment: 'Web Application Audit',    date: '2026-03-19 13:00', status: 'complete', findings: 12 },
      { assessment: 'Internal Network Scan',    date: '2026-03-17 10:30', status: 'complete', findings: 7 },
      { assessment: 'SSH Configuration Review', date: '2026-03-10 15:00', status: 'complete', findings: 4 },
    ]
    return [
      { text: 'Recent runs:', color: '#4F8EF7' },
      ...all.map(r => ({
        text: `  ${r.date}   ${r.assessment.padEnd(32)} ${r.status}   ${r.findings} findings`,
        color: '#9CA3AF',
      })),
    ]
  }
  return []
}

function executeHelp(topic) {
  if (!topic) {
    return [
      { text: '╔═══════════════════════════════════════════════════╗', color: '#2A2D3A' },
      { text: '║  SCOPE Assessment Console — Command Reference      ║', color: '#4F8EF7' },
      { text: '╚═══════════════════════════════════════════════════╝', color: '#2A2D3A' },
      { text: '', color: '' },
      { text: '  EXECUTION', color: '#6B7280' },
      { text: '  run playbook <name> [--dry-run] [--verbose]', color: '#E8EAF0' },
      { text: '  run module <category.name> [--verbose]', color: '#E8EAF0' },
      { text: '', color: '' },
      { text: '  QUERIES  (read-only, instant)', color: '#6B7280' },
      { text: '  show findings [critical|high|medium|low|info]', color: '#E8EAF0' },
      { text: '  show assessments | runs | playbooks | modules', color: '#E8EAF0' },
      { text: '', color: '' },
      { text: '  REPORTS', color: '#6B7280' },
      { text: '  export report <html|markdown|json>', color: '#E8EAF0' },
      { text: '', color: '' },
      { text: '  UTILITY', color: '#6B7280' },
      { text: '  refresh      Re-query findings and update KPIs', color: '#E8EAF0' },
      { text: '  suggest      Analyse findings, suggest next modules', color: '#E8EAF0' },
      { text: '  cancel       Stop the currently running task', color: '#E8EAF0' },
      { text: '  clear        Clear this terminal output  (Ctrl+L)', color: '#E8EAF0' },
      { text: '  help [verb]  Show this help or help for a specific verb', color: '#E8EAF0' },
      { text: '', color: '' },
      { text: '  ↑ / ↓  Navigate command history', color: '#6B7280' },
    ]
  }
  if (topic === 'run') {
    return [
      { text: 'run — Execute assessment tasks', color: '#4F8EF7' },
      { text: '', color: '' },
      { text: '  run playbook <name>', color: '#E8EAF0' },
      ...PLAYBOOKS.map(p => ({ text: `    ${p.name.padEnd(22)} ${p.desc}`, color: '#6B7280' })),
      { text: '', color: '' },
      { text: '  Flags:', color: '#6B7280' },
      { text: '    --dry-run    Show what would run without executing', color: '#6B7280' },
      { text: '    --verbose    Show detailed module output and raw values', color: '#6B7280' },
      { text: '', color: '' },
      { text: '  run module <module.name>', color: '#E8EAF0' },
      { text: '    Run "show modules" to see all 11 available modules', color: '#6B7280' },
    ]
  }
  if (topic === 'show') {
    return [
      { text: 'show — Query SCOPE data (read-only)', color: '#4F8EF7' },
      { text: '', color: '' },
      { text: '  show findings               All open findings', color: '#E8EAF0' },
      { text: '  show findings critical       Filter by severity', color: '#E8EAF0' },
      { text: '  show assessments             List all assessments', color: '#E8EAF0' },
      { text: '  show runs                    Recent run history', color: '#E8EAF0' },
      { text: '  show playbooks               Available playbooks', color: '#E8EAF0' },
      { text: '  show modules                 Available check modules', color: '#E8EAF0' },
    ]
  }
  if (topic === 'export') {
    return [
      { text: 'export — Generate assessment reports', color: '#4F8EF7' },
      { text: '', color: '' },
      { text: '  export report html           Generate HTML report', color: '#E8EAF0' },
      { text: '  export report markdown       Generate Markdown report', color: '#E8EAF0' },
      { text: '  export report json           Generate JSON report', color: '#E8EAF0' },
    ]
  }
  return [{ text: `No help entry for: "${topic}". Type "help" for all commands.`, color: '#6B7280' }]
}

// ─── Welcome message ─────────────────────────────────────────────────────────

const WELCOME_LINES = [
  { text: '  ╔═══════════════════════════════════════════╗', color: '#1E2130' },
  { text: '  ║  SCOPE Assessment Console  v1.0           ║', color: '#4F8EF7' },
  { text: '  ║  Security Configuration Observation and   ║', color: '#6B7280' },
  { text: '  ║  Protection Engine — Local Instance       ║', color: '#6B7280' },
  { text: '  ╚═══════════════════════════════════════════╝', color: '#1E2130' },
  { text: '', color: '' },
  { text: '  Defensive use only. All actions are logged.', color: '#F5A623' },
  { text: '  Type "help" to see available commands.', color: '#6B7280' },
  { text: '', color: '' },
]

// ─── Tab ID generator ────────────────────────────────────────────────────────

let _tabId = 0
function nextTabId() { return ++_tabId }

function createTab(name) {
  return {
    id: nextTabId(),
    name: name || 'Console',
    lines: [...WELCOME_LINES],
    history: [],   // command history, newest first
    isRunning: false,
  }
}

// ─── Color map for SSE events ─────────────────────────────────────────────────

const EVT_COLOR = {
  task_start:    '#4F8EF7',
  module_start:  '#6B7280',
  module_done:   '#3ECF8E',
  module_skip:   '#6B7280',
  finding:       '#F5A623',
  finding_critical: '#E5534B',
  warning:       '#F5A623',
  error:         '#E5534B',
  info:          '#6B7280',
  task_complete: '#3ECF8E',
  task_cancel:   '#F5A623',
  report:        '#A78BFA',
  suggest:       '#4F8EF7',
  divider:       '#2A2D3A',
  dry_run:       '#4F8EF7',
}

// ─── Terminal instance ────────────────────────────────────────────────────────

function TerminalInstance({ tab, isActive, onAddLines, onClearLines, onSetRunning, onAddHistory }) {
  const outputRef  = useRef(null)
  const inputRef   = useRef(null)
  const esRef      = useRef(null)   // active EventSource
  const [inputValue, setInputValue]   = useState('')
  const [histIdx, setHistIdx]         = useState(-1)
  const isRunning = tab.isRunning

  // Auto-scroll on new lines
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [tab.lines])

  // Focus when tab becomes active
  useEffect(() => {
    if (isActive) inputRef.current?.focus()
  }, [isActive])

  const ts = () => new Date().toLocaleTimeString('en-US', { hour12: false })

  const add = useCallback((lines) => onAddLines(tab.id, lines), [tab.id, onAddLines])

  // ── Task execution via SSE ────────────────────────────────────────────────

  const runTask = useCallback(async (parsed) => {
    if (isRunning) {
      add([{ text: '  ✗  A task is already running. Use "cancel" to stop it first.', color: '#E5534B' }])
      return
    }

    onSetRunning(tab.id, true)

    let taskId
    try {
      const res = await fetch('http://localhost:8000/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data = await res.json()
      taskId = data.task_id
    } catch (e) {
      add([{ text: `  ✗  Cannot reach SCOPE API: ${e.message}`, color: '#E5534B' },
           { text: '      Is the backend running on port 8000?', color: '#6B7280' }])
      onSetRunning(tab.id, false)
      return
    }

    const es = new EventSource(`http://localhost:8000/api/tasks/${taskId}/stream`)
    esRef.current = es

    es.onmessage = (event) => {
      const evt = JSON.parse(event.data)
      if (evt.type === 'done') {
        es.close()
        esRef.current = null
        onSetRunning(tab.id, false)
        return
      }
      const color = EVT_COLOR[evt.type] || '#9CA3AF'
      const line = evt.type === 'divider'
        ? { text: '  ─────────────────────────────────────────────────', color }
        : { text: `[${evt.ts}]  ${evt.icon || '·'}  ${evt.message}`, color }
      add([line])
    }

    es.onerror = () => {
      es.close()
      esRef.current = null
      onSetRunning(tab.id, false)
    }
  }, [tab.id, isRunning, add, onSetRunning])

  // ── Submit handler ────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async (raw) => {
    const cmd = raw.trim()
    if (!cmd) return

    // Echo the command with prompt
    add([{ text: `scope@local:~$ ${cmd}`, color: '#E8EAF0', isCmd: true }])
    onAddHistory(tab.id, cmd)

    const parsed = parseCommand(cmd)
    if (!parsed) return

    if (parsed.error) {
      add([{ text: `  ✗  ${parsed.error}`, color: '#E5534B' }])
      return
    }

    if (parsed.type === 'clear') {
      onClearLines(tab.id)
      return
    }

    if (parsed.type === 'cancel') {
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
        onSetRunning(tab.id, false)
        add([{ text: `  ⚠  Task cancelled by user at ${ts()}.`, color: '#F5A623' }])
      } else {
        add([{ text: '  ·  No task currently running.', color: '#6B7280' }])
      }
      return
    }

    if (parsed.type === 'help') {
      add(executeHelp(parsed.topic))
      return
    }

    if (parsed.type === 'query') {
      add(executeQuery(parsed))
      return
    }

    if (parsed.type === 'task') {
      await runTask(parsed)
    }
  }, [tab.id, add, onAddHistory, onClearLines, onSetRunning, runTask])

  // ── Key handler ───────────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      const val = inputValue
      setInputValue('')
      setHistIdx(-1)
      handleSubmit(val)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(histIdx + 1, tab.history.length - 1)
      setHistIdx(next)
      if (tab.history[next] !== undefined) setInputValue(tab.history[next])
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.max(histIdx - 1, -1)
      setHistIdx(next)
      setInputValue(next === -1 ? '' : (tab.history[next] || ''))
      return
    }
    if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      onClearLines(tab.id)
    }
  }, [inputValue, histIdx, tab.history, tab.id, handleSubmit, onClearLines])

  // ── Inject command from quick-action buttons ──────────────────────────────
  // Expose an inject function on the DOM node so Console can call it
  const containerRef = useRef(null)
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current._inject = (cmd) => {
        setInputValue(cmd)
        setTimeout(() => inputRef.current?.focus(), 0)
      }
    }
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      data-tab-id={tab.id}
      style={{
        display: isActive ? 'flex' : 'none',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#0A0C12',
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
        fontSize: '13px',
      }}
    >
      {/* ── Output ── */}
      <div
        ref={outputRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 18px',
          lineHeight: '1.75',
          scrollbarWidth: 'thin',
          scrollbarColor: '#2A2D3A #0A0C12',
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {tab.lines.map((line, i) => (
          <div
            key={i}
            style={{
              color: line.color || '#9CA3AF',
              whiteSpace: 'pre',
              minHeight: '1em',
              userSelect: line.isCmd ? 'text' : 'text',
            }}
          >
            {line.text}
          </div>
        ))}
      </div>

      {/* ── Input row ── */}
      <div
        style={{
          flexShrink: 0,
          borderTop: '1px solid #1A1D27',
          backgroundColor: '#0A0C12',
          padding: '10px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <span style={{ color: '#3ECF8E', userSelect: 'none', flexShrink: 0, letterSpacing: '0.02em' }}>
          scope@local:~$
        </span>

        {isRunning && (
          <span style={{
            color: '#F5A623', fontSize: '10px', userSelect: 'none',
            border: '1px solid rgba(245,166,35,0.35)', borderRadius: '4px',
            padding: '1px 6px', flexShrink: 0,
          }}>
            RUNNING
          </span>
        )}

        <input
          ref={inputRef}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isRunning ? 'Task running — type "cancel" to stop' : ''}
          autoComplete="off"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#E8EAF0',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            caretColor: '#3ECF8E',
            minWidth: 0,
          }}
        />
      </div>
    </div>
  )
}

// ─── Quick actions bar ────────────────────────────────────────────────────────

function QuickActionsBar({ onInject, activeIsRunning }) {
  const actions = [
    {
      label: 'Run Playbook',
      icon: Play,
      color: '#3ECF8E',
      bg: 'rgba(62,207,142,0.1)',
      border: 'rgba(62,207,142,0.25)',
      cmd: 'run playbook linux-baseline',
    },
    {
      label: 'Run Module',
      icon: Cpu,
      color: '#4F8EF7',
      bg: 'rgba(79,142,247,0.1)',
      border: 'rgba(79,142,247,0.25)',
      cmd: 'run module auth.ssh_config',
    },
    {
      label: 'Refresh Findings',
      icon: RefreshCw,
      color: '#E8EAF0',
      bg: 'rgba(255,255,255,0.04)',
      border: '#2A2D3A',
      cmd: 'refresh',
    },
    {
      label: 'Generate Report',
      icon: Download,
      color: '#A78BFA',
      bg: 'rgba(167,139,250,0.1)',
      border: 'rgba(167,139,250,0.25)',
      cmd: 'export report html',
    },
    {
      label: 'Suggest Checks',
      icon: Lightbulb,
      color: '#F5A623',
      bg: 'rgba(245,166,35,0.1)',
      border: 'rgba(245,166,35,0.25)',
      cmd: 'suggest',
    },
  ]

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 16px',
        borderBottom: '1px solid #2A2D3A',
        backgroundColor: '#1A1D27',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ color: '#6B7280', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', marginRight: '4px', flexShrink: 0 }}>
        QUICK ACTIONS
      </span>
      {actions.map(a => {
        const Icon = a.icon
        return (
          <button
            key={a.label}
            onClick={() => onInject(a.cmd)}
            disabled={activeIsRunning}
            title={`Inject: ${a.cmd}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              borderRadius: '6px',
              border: `1px solid ${a.border}`,
              backgroundColor: a.bg,
              color: activeIsRunning ? '#4B5563' : a.color,
              fontSize: '12px',
              fontWeight: 500,
              cursor: activeIsRunning ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.15s',
              opacity: activeIsRunning ? 0.5 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            <Icon size={13} />
            {a.label}
          </button>
        )
      })}

      <div style={{ flex: 1 }} />

      <span style={{
        fontSize: '11px', color: '#6B7280',
        fontFamily: '"JetBrains Mono", monospace',
      }}>
        ↑↓ history · Ctrl+L clear
      </span>
    </div>
  )
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

function TabBar({ tabs, activeId, onSwitch, onNew, onClose, onRename }) {
  const [editingId, setEditingId] = useState(null)
  const [editVal, setEditVal]     = useState('')

  const startEdit = (tab) => {
    setEditingId(tab.id)
    setEditVal(tab.name)
  }

  const commitEdit = (id) => {
    if (editVal.trim()) onRename(id, editVal.trim())
    setEditingId(null)
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        backgroundColor: '#0D0F16',
        borderBottom: '1px solid #2A2D3A',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        flexShrink: 0,
      }}
    >
      {tabs.map(tab => {
        const isActive = tab.id === activeId
        return (
          <div
            key={tab.id}
            onClick={() => onSwitch(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 14px',
              height: '36px',
              minWidth: '120px',
              maxWidth: '200px',
              cursor: 'pointer',
              borderRight: '1px solid #1A1D27',
              borderBottom: isActive ? '2px solid #4F8EF7' : '2px solid transparent',
              backgroundColor: isActive ? '#0A0C12' : 'transparent',
              transition: 'background-color 0.1s',
              flexShrink: 0,
              userSelect: 'none',
            }}
          >
            {/* Running indicator */}
            {tab.isRunning ? (
              <div style={{
                width: 7, height: 7, borderRadius: '50%',
                backgroundColor: '#F5A623',
                flexShrink: 0,
                animation: 'pulse 1.5s ease-in-out infinite',
              }} />
            ) : (
              <Terminal size={12} style={{ color: isActive ? '#4F8EF7' : '#6B7280', flexShrink: 0 }} />
            )}

            {/* Tab name — double-click to rename */}
            {editingId === tab.id ? (
              <input
                autoFocus
                value={editVal}
                onChange={e => setEditVal(e.target.value)}
                onBlur={() => commitEdit(tab.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitEdit(tab.id)
                  if (e.key === 'Escape') setEditingId(null)
                  e.stopPropagation()
                }}
                onClick={e => e.stopPropagation()}
                style={{
                  flex: 1, minWidth: 0,
                  background: 'transparent',
                  border: 'none', outline: 'none',
                  color: '#E8EAF0',
                  fontSize: '12px',
                  fontFamily: 'inherit',
                }}
              />
            ) : (
              <span
                onDoubleClick={(e) => { e.stopPropagation(); startEdit(tab) }}
                style={{
                  flex: 1, minWidth: 0,
                  fontSize: '12px',
                  color: isActive ? '#E8EAF0' : '#6B7280',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title="Double-click to rename"
              >
                {tab.name}
              </span>
            )}

            {/* Close button */}
            {tabs.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); onClose(tab.id) }}
                style={{
                  background: 'none', border: 'none',
                  padding: '2px', cursor: 'pointer',
                  color: '#4B5563', borderRadius: '3px',
                  display: 'flex', alignItems: 'center',
                  flexShrink: 0,
                  transition: 'color 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#E5534B'}
                onMouseLeave={e => e.currentTarget.style.color = '#4B5563'}
                title="Close tab"
              >
                <X size={11} />
              </button>
            )}
          </div>
        )
      })}

      {/* New tab button */}
      <button
        onClick={onNew}
        title="New terminal tab"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 12px',
          background: 'none', border: 'none',
          color: '#6B7280', cursor: 'pointer',
          fontSize: '18px', lineHeight: 1,
          transition: 'color 0.1s',
          flexShrink: 0,
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#E8EAF0'}
        onMouseLeave={e => e.currentTarget.style.color = '#6B7280'}
      >
        <Plus size={14} />
      </button>
    </div>
  )
}

// ─── Console page ─────────────────────────────────────────────────────────────

export default function Console() {
  const [tabs, setTabs]         = useState(() => [createTab('Console 1')])
  const [activeId, setActiveId] = useState(() => tabs[0].id)
  const termRefs = useRef({})  // tabId -> DOM node

  const activeTab = tabs.find(t => t.id === activeId) || tabs[0]

  // ── Tab operations ────────────────────────────────────────────────────────

  const addTab = useCallback(() => {
    const t = createTab(`Console ${tabs.length + 1}`)
    setTabs(prev => [...prev, t])
    setActiveId(t.id)
  }, [tabs.length])

  const closeTab = useCallback((id) => {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id)
      if (next.length === 0) return prev
      return next
    })
    setActiveId(prev => {
      if (prev !== id) return prev
      const idx = tabs.findIndex(t => t.id === id)
      const next = tabs[idx + 1] || tabs[idx - 1]
      return next ? next.id : tabs[0].id
    })
  }, [tabs])

  const switchTab = useCallback((id) => setActiveId(id), [])

  const renameTab = useCallback((id, name) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, name } : t))
  }, [])

  // ── Per-tab data mutations ─────────────────────────────────────────────────

  const addLines = useCallback((tabId, lines) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, lines: [...t.lines, ...lines] } : t
    ))
  }, [])

  const clearLines = useCallback((tabId) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, lines: [...WELCOME_LINES] } : t
    ))
  }, [])

  const setRunning = useCallback((tabId, val) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, isRunning: val } : t
    ))
  }, [])

  const addHistory = useCallback((tabId, cmd) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t
      // Newest first, deduplicate, max 50
      const h = [cmd, ...t.history.filter(c => c !== cmd)].slice(0, 50)
      return { ...t, history: h }
    }))
  }, [])

  // ── Inject command into active terminal ───────────────────────────────────

  const injectCommand = useCallback((cmd) => {
    // Find the active terminal DOM node and call its inject method
    const el = document.querySelector(`[data-tab-id="${activeId}"]`)
    if (el?._inject) {
      el._inject(cmd)
    }
  }, [activeId])

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 56px)',  // subtract header height
      margin: '-24px',               // cancel Layout padding
      backgroundColor: '#0D0F16',
    }}>
      {/* Quick actions */}
      <QuickActionsBar
        onInject={injectCommand}
        activeIsRunning={activeTab.isRunning}
      />

      {/* Tab bar */}
      <TabBar
        tabs={tabs}
        activeId={activeId}
        onSwitch={switchTab}
        onNew={addTab}
        onClose={closeTab}
        onRename={renameTab}
      />

      {/* Terminals — all mounted, only active is visible */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {tabs.map(tab => (
          <div key={tab.id} style={{ position: 'absolute', inset: 0 }}>
            <TerminalInstance
              tab={tab}
              isActive={tab.id === activeId}
              onAddLines={addLines}
              onClearLines={clearLines}
              onSetRunning={setRunning}
              onAddHistory={addHistory}
            />
          </div>
        ))}
      </div>

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}
