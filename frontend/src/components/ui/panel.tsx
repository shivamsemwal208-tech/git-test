import type { ReactNode } from 'react'

export function Panel({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`panel ${className}`.trim()}>{children}</div>
}

export function PanelHeader({
  eyebrow,
  title,
  icon,
  action,
  className = '',
}: {
  eyebrow?: string
  title?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`.trim()}>
      <div className="flex items-center gap-2.5">
        {icon}
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          {title && <h2 className="mt-1 text-base font-semibold text-white">{title}</h2>}
        </div>
      </div>
      {action}
    </div>
  )
}