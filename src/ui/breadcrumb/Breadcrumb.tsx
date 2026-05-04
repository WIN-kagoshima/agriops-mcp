/**
 * Breadcrumb.tsx — 国 → 地方 → 都道府県 → 市町村 → 圃場 のパンくずリスト
 */

export interface BreadcrumbItem {
  label: string;
  level: "nation" | "region" | "prefecture" | "city" | "field";
  code?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  onNavigate: (index: number) => void;
}

export function Breadcrumb({ items, onNavigate }: BreadcrumbProps) {
  return (
    <nav className="breadcrumb" aria-label="ナビゲーション">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="breadcrumb-item">
            {i > 0 && <span className="breadcrumb-sep">›</span>}
            {isLast ? (
              <span className="breadcrumb-current">{item.label}</span>
            ) : (
              <button type="button" className="breadcrumb-link" onClick={() => onNavigate(i)}>
                {item.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
