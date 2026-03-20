import React from 'react'

export default function KPICard({ title, value, subtitle, subtitleColor, icon: Icon, iconColor, trend, trendValue }) {
  return (
    <div
      className="rounded-xl p-5 transition-colors hover:border-primary/50 cursor-default"
      style={{
        backgroundColor: '#1A1D27',
        border: '1px solid #2A2D3A',
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: '#6B7280' }}>
            {title}
          </p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold" style={{ color: '#E8EAF0' }}>
              {value}
            </p>
            {trend && (
              <span
                className="text-sm font-medium"
                style={{ color: trend === 'down' ? '#3ECF8E' : '#E5534B' }}
              >
                {trend === 'down' ? '↓' : '↑'} {trendValue}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs mt-1" style={{ color: subtitleColor || '#6B7280' }}>
              {subtitle}
            </p>
          )}
        </div>
        {Icon && (
          <div
            className="flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0"
            style={{ backgroundColor: `${iconColor}18` || '#4F8EF718' }}
          >
            <Icon size={20} style={{ color: iconColor || '#4F8EF7' }} />
          </div>
        )}
      </div>
    </div>
  )
}
