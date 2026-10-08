'use client';

import { TIPOS, type Desarrollo } from '@/content/desarrollos';
import { ArrowIcon, TipoIcon } from './icons';
import styles from './MapHub.module.css';

export type Filtro = 'todos' | 'edificio' | 'barrio' | 'casas' | 'futuro';

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'edificio', label: 'Edificios' },
  { id: 'barrio', label: 'Barrios' },
  { id: 'casas', label: 'Casas' },
  { id: 'futuro', label: 'Próximamente' },
];

interface Props {
  desarrollos: Desarrollo[];
  visibles: Set<string>;
  filtro: Filtro;
  onFiltro: (f: Filtro) => void;
  selected: Desarrollo | null;
  hoveredId: string | null;
  onSelect: (d: Desarrollo | null) => void;
  onHover: (id: string | null) => void;
  onEnter3D: (d: Desarrollo) => void;
}

export function DevelopmentPanel({ desarrollos, visibles, filtro, onFiltro, selected, hoveredId, onSelect, onHover, onEnter3D }: Props) {
  return (
    <aside className={styles.panel} aria-label="Desarrollos de MARQ">
      <header className={styles.brand}>
        <span className={styles.brandMark}>MARQ</span>
        <span className={styles.brandSub}>
          <strong>Experience</strong>
          <span>Viví MARQ antes de vivir en MARQ</span>
        </span>
      </header>

      {selected ? (
        <section className={styles.detail} aria-live="polite">
          <button type="button" className={styles.back} onClick={() => onSelect(null)}>
            ← Todos los desarrollos
          </button>
          <div className={styles.chips}>
            <span className={styles.chip}>
              <TipoIcon tipo={selected.tipo} /> {TIPOS[selected.tipo]}
            </span>
            {selected.etiquetaEstado && (
              <span className={styles.chip} data-estado={selected.estado}>
                {selected.etiquetaEstado}
              </span>
            )}
          </div>
          <h2 className={styles.detailTitle}>{selected.nombre}</h2>
          <p className={styles.detailPlace}>{selected.lugar}</p>
          <p className={styles.detailText}>{selected.resumen}</p>
          {selected.datos && (
            <ul className={styles.facts}>
              {selected.datos.map((dato) => (
                <li key={dato}>{dato}</li>
              ))}
            </ul>
          )}
          <div className={styles.actions}>
            {selected.recorrido3d ? (
              <button type="button" className="btn btn-accent" onClick={() => onEnter3D(selected)}>
                Recorrer en 3D <ArrowIcon />
              </button>
            ) : (
              <button type="button" className="btn btn-ghost" disabled>
                Recorrido 3D próximamente
              </button>
            )}
            <a className={styles.link} href={selected.url} target="_blank" rel="noopener noreferrer">
              Ver en estudiomarq.com.ar ↗
            </a>
          </div>
        </section>
      ) : (
        <section className={styles.list}>
          <p className={styles.intro}>
            Explorá los desarrollos de MARQ en la ciudad. <strong>La Torre Natalini</strong> se puede recorrer en 3D, del hall a un departamento.
          </p>
          <div className={styles.filters} role="group" aria-label="Filtrar desarrollos">
            {FILTROS.map((f) => (
              <button key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => onFiltro(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          <ul className={styles.items}>
            {desarrollos
              .filter((d) => visibles.has(d.id))
              .map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className={styles.item}
                    data-active={d.id === hoveredId ? '' : undefined}
                    onClick={() => onSelect(d)}
                    onPointerEnter={() => onHover(d.id)}
                    onPointerLeave={() => onHover(null)}
                  >
                    <span className={styles.itemIcon} data-tipo={d.tipo} data-estado={d.estado}>
                      <TipoIcon tipo={d.tipo} />
                    </span>
                    <span className={styles.itemText}>
                      <strong>{d.nombre}</strong>
                      <span>{[TIPOS[d.tipo], d.etiquetaEstado].filter(Boolean).join(' · ')}</span>
                    </span>
                    {d.recorrido3d && <span className={styles.itemBadge}>3D</span>}
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
