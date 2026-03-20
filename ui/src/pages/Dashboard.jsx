import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Sector,
} from 'recharts'
import {
  ClipboardList, AlertTriangle, Play, TrendingDown,
  Plus, Terminal, Download, CheckCircle, FileText, Shield,
} from 'lucide-react'
import KPICard from '../components/shared/KPICard'
import {
  assessments,
  kpiData,
  findingsBySeverity,
  riskOverTime,
  findingsByCategory,
  recentActivity,
} from '../data/mockData'

const SEVERITY_COLORS = {
  Critical: '#E5534B',
  High: '#F5A623',
  Medium: '#F5D623',
  Low: '#4F8EF7',
}

function ActivityIcon({ type, color }) {
  const iconProps = { size: 14, style: { color: color === 'success' ? '#3ECF8E' : '#4F8EF7' } }
  if (type === 'run_complete') return <CheckCircle {...iconProps} />
  if (type === 'report_generated') return <FileText {...iconProps} />
  if (type === 'finding_remediated') return <Shield {...iconProps} />
  if (type === 'assessment_created') return <Plus {...iconProps} />
  return <CheckCircle {...iconProps} />
}

function formatRelativeTime(ts) {
  const date = new Date(ts)
  const now = new Date('2026-03-19T16:00:00')
  const diffMs = now - date
  const diffH = Math.floor(diffMs / 3600000)
  const diffD = Math.floor(diffMs / 86400000)
  if (diffH < 1) return 'Just now'
  if (diffH < 24) return `${diffH}h ago`
  if (diffD === 1) return 'Yesterday'
  return `${diffD}d ago`
}

function CustomDonutLabel({ cx, cy, total }) {
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
      <tspan x={cx} dy="-6" fontSize="22" fontWeight="700" fill="#E8EAF0">{total}</tspan>
      <tspan x={cx} dy="20" fontSize="11" fill="#6B7280">findings</tspan>
    </text>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          backgroundColor: '#1A1D27',
          border: '1px solid #2A2D3A',
          borderRadius: '10px',
          padding: '10px 14px',
        }}
      >
        <p style={{ color: '#E8EAF0', fontWeight: 600, marginBottom: 6, fontSize: 13 }}>{label}</p>
        {payload.map(p => (
          <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: p.fill || p.stroke, display: 'inline-block' }} />
            <span style={{ color: '#6B7280', fontSize: 12 }}>{p.dataKey || p.name}:</span>
            <span style={{ color: '#E8EAF0', fontSize: 12, fontWeight: 600 }}>{p.value}</span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

const LineTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          backgroundColor: '#1A1D27',
          border: '1px solid #2A2D3A',
          borderRadius: '10px',
          padding: '10px 14px',
        }}
      >
        <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 4 }}>{label}</p>
        <p style={{ color: '#4F8EF7', fontSize: 18, fontWeight: 700 }}>{payload[0].value.toFixed(1)}</p>
        <p style={{ color: '#6B7280', fontSize: 11 }}>Risk Score</p>
      </div>
    )
  }
  return null
}

export default function Dashboard() {
  const navigate = useNavigate()
  const totalFindings = findingsByCategory.reduce((s, c) => s + c.value, 0)

  return (
    <div className="space-y-6">
      {/* Context bar */}
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
        style={{
          backgroundColor: 'rgba(79, 142, 247, 0.08)',
          border: '1px solid rgba(79, 142, 247, 0.2)',
          color: '#4F8EF7',
        }}
      >
        <Shield size={15} />
        <span className="font-medium">SCOPE is running locally</span>
        <span style={{ color: '#6B7280' }}>— All data is stored on your machine. No data leaves your system.</span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Assessments"
          value={kpiData.totalAssessments}
          subtitle="2 active, 1 draft"
          icon={ClipboardList}
          iconColor="#4F8EF7"
        />
        <KPICard
          title="Open Findings"
          value={kpiData.openFindings}
          subtitle={`${kpiData.criticalFindings} critical`}
          subtitleColor="#E5534B"
          icon={AlertTriangle}
          iconColor="#E5534B"
        />
        <KPICard
          title="Runs This Week"
          value={kpiData.runsThisWeek}
          subtitle="Last: Today 13:00"
          icon={Play}
          iconColor="#3ECF8E"
        />
        <KPICard
          title="Risk Score"
          value={kpiData.riskScore}
          subtitle="Improving"
          subtitleColor="#3ECF8E"
          icon={TrendingDown}
          iconColor="#3ECF8E"
          trend="down"
          trendValue="0.1"
        />
      </div>

      {/* Main chart: Findings by Severity */}
      <div
        className="rounded-xl p-6"
        style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
      >
        <h2 className="text-sm font-semibold mb-5" style={{ color: '#E8EAF0' }}>
          Findings by Severity
        </h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={findingsBySeverity} barGap={4} barCategoryGap="28%">
            <CartesianGrid strokeDasharray="3 3" stroke="#2A2D3A" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#6B7280', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Legend
              wrapperStyle={{ paddingTop: 16 }}
              formatter={val => <span style={{ color: '#6B7280', fontSize: 12 }}>{val}</span>}
            />
            <Bar dataKey="Critical" fill="#E5534B" radius={[4, 4, 0, 0]} />
            <Bar dataKey="High" fill="#F5A623" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Medium" fill="#F5D623" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Low" fill="#4F8EF7" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom row: Risk Over Time + Category Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Risk Score Over Time */}
        <div
          className="rounded-xl p-6"
          style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
        >
          <h2 className="text-sm font-semibold mb-5" style={{ color: '#E8EAF0' }}>
            Risk Score Over Time
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={riskOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2D3A" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis domain={[5, 10]} tick={{ fill: '#6B7280', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip content={<LineTooltip />} cursor={{ stroke: '#2A2D3A', strokeWidth: 1 }} />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#4F8EF7"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#4F8EF7', strokeWidth: 0 }}
                activeDot={{ r: 6, fill: '#4F8EF7', strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Findings by Category Donut */}
        <div
          className="rounded-xl p-6"
          style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
        >
          <h2 className="text-sm font-semibold mb-5" style={{ color: '#E8EAF0' }}>
            Findings by Category
          </h2>
          <div className="flex items-center gap-6">
            <div style={{ width: 180, height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={findingsByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={82}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {findingsByCategory.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div style={{
                            backgroundColor: '#1A1D27',
                            border: '1px solid #2A2D3A',
                            borderRadius: '8px',
                            padding: '8px 12px',
                          }}>
                            <p style={{ color: '#E8EAF0', fontSize: 12, fontWeight: 600 }}>{payload[0].name}</p>
                            <p style={{ color: payload[0].payload.color, fontSize: 14, fontWeight: 700 }}>{payload[0].value}</p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="flex-1 space-y-2">
              {findingsByCategory.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-sm" style={{ color: '#6B7280' }}>{item.name}</span>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: '#E8EAF0' }}>{item.value}</span>
                </div>
              ))}
              <div
                className="pt-2 mt-2 flex items-center justify-between"
                style={{ borderTop: '1px solid #2A2D3A' }}
              >
                <span className="text-sm font-medium" style={{ color: '#6B7280' }}>Total</span>
                <span className="text-sm font-bold" style={{ color: '#E8EAF0' }}>{totalFindings}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row: Recent Activity + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Activity */}
        <div
          className="lg:col-span-2 rounded-xl p-6"
          style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: '#E8EAF0' }}>
            Recent Activity
          </h2>
          <div className="space-y-3">
            {recentActivity.map(event => (
              <div key={event.id} className="flex items-start gap-3 py-2">
                <div
                  className="flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: event.color === 'success' ? 'rgba(62,207,142,0.12)' : 'rgba(79,142,247,0.12)' }}
                >
                  <ActivityIcon type={event.type} color={event.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: '#E8EAF0' }}>{event.message}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>{event.detail}</p>
                </div>
                <span className="text-xs flex-shrink-0" style={{ color: '#6B7280' }}>
                  {formatRelativeTime(event.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div
          className="rounded-xl p-6"
          style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: '#E8EAF0' }}>
            Quick Actions
          </h2>
          <div className="space-y-3">
            <button
              onClick={() => navigate('/assessments')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all hover:brightness-110"
              style={{
                backgroundColor: '#4F8EF7',
                color: '#fff',
              }}
            >
              <Plus size={16} />
              New Assessment
            </button>
            <button
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors hover:bg-white/5"
              style={{
                backgroundColor: 'rgba(62,207,142,0.1)',
                border: '1px solid rgba(62,207,142,0.2)',
                color: '#3ECF8E',
              }}
            >
              <Terminal size={16} />
              Run Playbook
            </button>
            <button
              onClick={() => navigate('/reports')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors hover:bg-white/5"
              style={{
                backgroundColor: 'rgba(255,255,255,0.04)',
                border: '1px solid #2A2D3A',
                color: '#E8EAF0',
              }}
            >
              <Download size={16} />
              Export Report
            </button>
          </div>

          {/* Assessment summary */}
          <div className="mt-6">
            <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: '#6B7280' }}>
              Assessment Status
            </p>
            <div className="space-y-2">
              {assessments.slice(0, 4).map(a => (
                <div key={a.id} className="flex items-center justify-between">
                  <span className="text-xs truncate pr-2" style={{ color: '#6B7280', maxWidth: '70%' }}>{a.name}</span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded font-medium"
                    style={{
                      backgroundColor:
                        a.status === 'active' ? 'rgba(79,142,247,0.15)' :
                        a.status === 'complete' ? 'rgba(62,207,142,0.15)' :
                        'rgba(107,114,128,0.15)',
                      color:
                        a.status === 'active' ? '#4F8EF7' :
                        a.status === 'complete' ? '#3ECF8E' :
                        '#6B7280',
                    }}
                  >
                    {a.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
