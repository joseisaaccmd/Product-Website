'use client'

import { useEffect, useRef } from 'react'
import { ArrowUpRight } from 'lucide-react'

const catalog = [
  {
    key: 'coffee',
    name: 'Cold brew',
    category: 'Coffee',
    note: 'Boldly brewed, smoothly chilled — an 18-hour steep for a clean, cocoa-deep finish.',
    image: '/images/coffee-drink-transparent.png',
    alt: 'Cold brew coffee drink',
    format: '250 ml',
    caffeine: 'High',
    price: '$6',
    accent: 'coffee',
  },
  {
    key: 'matcha',
    name: 'Creamy matcha',
    category: 'Matcha',
    note: 'Calm energy, whisked to perfection — ceremonial-grade leaf folded into oat cream.',
    image: '/images/matcha-drink-transparent.png',
    alt: 'Creamy matcha drink',
    format: '250 ml',
    caffeine: 'Medium',
    price: '$7',
    accent: 'matcha',
  },
] as const

export function AllProducts() {
  const rootRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = rootRef.current
    if (!el) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      el.classList.add('is-in')
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.classList.add('is-in')
            io.disconnect()
          }
        })
      },
      { threshold: 0.18 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <section className="all-products" id="all-products" ref={rootRef} aria-label="All products">
      <div className="all-products__inner">
        <header className="all-products__head">
          <p className="ap-eyebrow reveal">The full lineup — 02</p>
          <h2 className="ap-title reveal">All products</h2>
          <p className="ap-lead reveal">
            Two small-batch drinks, made in tiny runs and never left sitting on a shelf for long. Pick your pour.
          </p>
        </header>

        <div className="ap-grid">
          {catalog.map((item) => (
            <article className={`ap-card reveal ap-card--${item.accent}`} key={item.key}>
              <div className="ap-card__media">
                <span className="ap-card__disc" aria-hidden="true" />
                <img src={item.image || '/placeholder.svg'} alt={item.alt} className="ap-card__img" />
              </div>
              <div className="ap-card__body">
                <div className="ap-card__row">
                  <span className="ap-card__cat">{item.category}</span>
                  <span className="ap-card__price">{item.price}</span>
                </div>
                <h3 className="ap-card__name">{item.name}</h3>
                <p className="ap-card__note">{item.note}</p>
                <dl className="ap-card__specs">
                  <div>
                    <dt>Format</dt>
                    <dd>{item.format}</dd>
                  </div>
                  <div>
                    <dt>Caffeine</dt>
                    <dd>{item.caffeine}</dd>
                  </div>
                </dl>
                <button className="ap-card__cta" type="button">
                  Add to bag <ArrowUpRight size={15} strokeWidth={1.8} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

export default AllProducts
