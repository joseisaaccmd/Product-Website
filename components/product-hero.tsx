'use client'

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import gsap from 'gsap'
import { CustomEase } from 'gsap/CustomEase'
import { ArrowLeft, ArrowRight, ShoppingBag } from 'lucide-react'

gsap.registerPlugin(CustomEase)

const products = {
  coffee: {
    key: 'coffee',
    name: 'Cold brew',
    title: 'Coffee',
    subtitle: 'Boldly brewed. Smoothly chilled.',
    image: '/images/coffee-drink-transparent.png',
    alt: 'Cold brew coffee drink',
    theme: 'coffee-theme',
    index: '01',
  },
  matcha: {
    key: 'matcha',
    name: 'Creamy matcha',
    title: 'Matcha',
    subtitle: 'Calm energy, whisked to perfection.',
    image: '/images/matcha-drink-transparent.png',
    alt: 'Creamy matcha drink',
    theme: 'matcha-theme',
    index: '02',
  },
} as const

type ProductKey = keyof typeof products

/* ---------------------------------------------------------------------------
   Custom eases — the heart of the "smooth banget" feel.
   Stock eases (power2/3) are fine, but hand-authored beziers let the spin
   accelerate slowly, hold momentum through the middle, and glide into rest
   with almost no visible stop. These are the same curve shapes used in
   high-end product reveals.
--------------------------------------------------------------------------- */
CustomEase.create('silk', 'M0,0 C0.25,0.1 0.25,1 1,1')
// long, weighted glide: slow lift-off, long float, feather-soft landing
CustomEase.create('glide', 'M0,0 C0.16,0.84 0.06,1 1,1')
// the spin: eases in gently, carries momentum, settles without a hard stop
CustomEase.create('spin', 'M0,0 C0.62,0 0.12,1 1,1')
// soft overshoot for elements that "arrive" (much gentler than back.out)
CustomEase.create('arrive', 'M0,0 C0.2,0.9 0.28,1.06 1,1')

// ---- Cylinder geometry --------------------------------------------------
// The drink is rebuilt as a real 3D cylinder made of vertical image slices.
// Each slice is a thin strip of the drink photo, rotated around a shared
// vertical axis and pushed outward by the cylinder radius.
const IMG_W = 300
const IMG_H = 440
const SLICES = 30 // more slices = rounder silhouette + smoother highlight sweep
const ARC_STEP = 180 / SLICES
const RADIUS = IMG_W / Math.PI
const SLICE_W = IMG_W / SLICES

type Slice = {
  angle: number
  transform: string
  bgPos: string
  brightness: number
}

function buildHemisphere(mirror: boolean): Slice[] {
  return Array.from({ length: SLICES }, (_, i) => {
    const angle = -90 + ARC_STEP * (i + 0.5)
    const strip = mirror ? SLICES - 1 - i : i
    const brightness = 1 - (0.34 * Math.abs(angle)) / 90
    return {
      angle,
      transform: `rotateY(${angle}deg) translateZ(${RADIUS}px)`,
      bgPos: `${-(strip * SLICE_W)}px 0`,
      brightness,
    }
  })
}

/* Every slice carries BOTH drink photos as permanently-mounted stacked layers.
   This is what kills the "disappear for a split second" flash: previously the
   slice's background-image URL was swapped mid-spin, so the browser had to
   fetch + decode a never-before-seen image and painted nothing in the meantime.
   Now both images are in the layer tree from the very first paint and the
   switch is a pure opacity crossfade — compositor-only, so it can never blank
   out and never needs a re-render. */
const PRODUCT_KEYS = Object.keys(products) as ProductKey[]

function renderSlices(list: Slice[], prefix: string) {
  return list.map((s, i) => (
    <span
      key={`${prefix}${i}`}
      className="drink3d__slice"
      style={{ transform: s.transform, filter: `brightness(${s.brightness})` }}
    >
      {PRODUCT_KEYS.map((k) => (
        <i
          key={k}
          className="drink3d__layer"
          data-drink={k}
          style={{ backgroundImage: `url(${products[k].image})`, backgroundPosition: s.bgPos }}
        />
      ))}
    </span>
  ))
}

// Split into words, then characters. Words are kept in their own inline-block
// so a line break can only happen BETWEEN words — otherwise per-char spans let
// the browser break in the middle of a word ("Cold br / ew").
function splitChars(text: string) {
  return text.split(' ').map((word, wi, arr) => (
    <span className="word" key={`w${wi}`}>
      {word.split('').map((ch, ci) => (
        <span className="char" key={`c${ci}`}>
          <span className="char__inner">{ch}</span>
        </span>
      ))}
      {wi < arr.length - 1 && (
        <span className="char char--space">
          <span className="char__inner">{'\u00A0'}</span>
        </span>
      )}
    </span>
  ))
}

export function ProductHero() {
  const [active, setActive] = useState<ProductKey>('coffee')

  const rootRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const drinkWrapRef = useRef<HTMLDivElement>(null) // parallax + idle float
  const drinkRef = useRef<HTMLDivElement>(null) // rotation only
  const titleRef = useRef<HTMLHeadingElement>(null)
  const eyebrowRef = useRef<HTMLParagraphElement>(null)
  const subtitleRef = useRef<HTMLParagraphElement>(null)
  const bgWordRef = useRef<HTMLDivElement>(null)
  const coffeeArtRef = useRef<HTMLImageElement>(null)
  const matchaArtRef = useRef<HTMLImageElement>(null)
  const shadowRef = useRef<HTMLDivElement>(null)
  const glareRef = useRef<HTMLDivElement>(null)

  const rotationRef = useRef(0)
  const isAnimating = useRef(false)
  const queued = useRef(0) // clicks buffered during a spin — never dropped
  const idleTl = useRef<gsap.core.Timeline | null>(null)

  const product = products[active]
  const frontSlices = useMemo(() => buildHemisphere(false), [])
  const backSlices = useMemo(() => buildHemisphere(true), [])

  /* ---------------- intro + ambient motion ---------------- */
  useLayoutEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Force both drink bitmaps fully decoded during the intro, long before any
    // click, so the first crossfade can't stall on a decode.
    PRODUCT_KEYS.forEach((k) => {
      const img = new Image()
      img.src = products[k].image
      void img.decode?.().catch(() => {})
    })

    const ctx = gsap.context(() => {
      const slices = gsap.utils.toArray<HTMLElement>('.drink3d__slice')

      gsap.set(drinkRef.current, { rotationY: 0, transformPerspective: 1600 })
      gsap.set(coffeeArtRef.current, { opacity: 0.84, y: 0, rotate: 0, scale: 1 })
      gsap.set(matchaArtRef.current, { opacity: 0, y: -170, rotate: 8, scale: 1 })
      gsap.set('.char__inner', { yPercent: 100, opacity: 0 })

      if (reduce) {
        gsap.set([stageRef.current, drinkRef.current, drinkWrapRef.current], { opacity: 1, clearProps: 'transform' })
        gsap.set('.char__inner', { yPercent: 0, opacity: 1 })
        return
      }

      /* Intro: one orchestrated sequence. Everything shares the same curve
         family so the whole page feels like a single continuous motion
         instead of a handful of separate animations firing. */
      const intro = gsap.timeline({ defaults: { ease: 'glide' } })

      intro
        .fromTo(stageRef.current, { opacity: 0 }, { opacity: 1, duration: 1.2, ease: 'none' }, 0)
        // background word breathes up into place behind everything
        .fromTo(
          bgWordRef.current,
          { opacity: 0, scale: 1.14, yPercent: 6, filter: 'blur(18px)' },
          { opacity: 1, scale: 1, yPercent: 0, filter: 'blur(0px)', duration: 1.9 },
          0,
        )
        // the glass turns in from the side, slices cascading so the cylinder
        // appears to *assemble* itself as it rotates into view
        .fromTo(
          drinkRef.current,
          { rotationY: -128, scale: 0.82, opacity: 0 },
          { rotationY: 0, scale: 1, opacity: 1, duration: 2.1, ease: 'spin' },
          0.1,
        )
        .fromTo(
          slices,
          { opacity: 0, scaleY: 0.86 },
          {
            opacity: 1,
            scaleY: 1,
            duration: 1.1,
            ease: 'silk',
            stagger: { each: 0.012, from: 'center' },
          },
          0.18,
        )
        .fromTo(
          coffeeArtRef.current,
          { y: -130, opacity: 0, scale: 1.08 },
          { y: 0, opacity: 0.84, scale: 1, duration: 1.9, ease: 'arrive' },
          0.24,
        )
        .fromTo(
          shadowRef.current,
          { scaleX: 0.3, opacity: 0 },
          { scaleX: 1, opacity: 1, duration: 1.5 },
          0.3,
        )
        // copy rises line by line, characters feathered in
        .to(
          eyebrowRef.current,
          { opacity: 1, y: 0, duration: 1, ease: 'silk' },
          0.45,
        )
        .to(
          '.hero-copy h1 .char__inner',
          { yPercent: 0, opacity: 1, duration: 1.2, ease: 'glide', stagger: 0.032 },
          0.5,
        )
        .to(subtitleRef.current, { opacity: 1, y: 0, duration: 1.1, ease: 'silk' }, 0.72)
        .to('.stagger-in', { opacity: 1, y: 0, duration: 0.9, ease: 'silk', stagger: 0.06 }, 0.3)

      /* Ambient idle: a slow, continuous breath so the scene is never frozen.
         Two out-of-phase sines (y + rotate) keep it organic rather than loopy. */
      idleTl.current = gsap
        .timeline({ repeat: -1, yoyo: true, defaults: { ease: 'sine.inOut' } })
        .to(drinkWrapRef.current, { y: -12, duration: 3.2 }, 0)
        .to(drinkRef.current, { rotationZ: 1.1, duration: 4.1 }, 0)
        .to(shadowRef.current, { scaleX: 0.94, opacity: 0.82, duration: 3.2 }, 0)
        .to([coffeeArtRef.current, matchaArtRef.current], { y: 8, duration: 4.6 }, 0)

      idleTl.current.progress(0.5)

      /* Cursor parallax — quickTo gives frame-rate-independent, always-smooth
         interpolation toward the pointer instead of a jumpy tween restart. */
      const xTo = gsap.quickTo(drinkWrapRef.current, 'x', { duration: 1.1, ease: 'power3' })
      const rotTo = gsap.quickTo(drinkRef.current, 'rotationY', { duration: 1.4, ease: 'power3' })
      const wordTo = gsap.quickTo(bgWordRef.current, 'x', { duration: 1.6, ease: 'power3' })
      const artTo = gsap.quickTo([coffeeArtRef.current, matchaArtRef.current], 'x', {
        duration: 2,
        ease: 'power3',
      })
      const glareTo = gsap.quickTo(glareRef.current, 'xPercent', { duration: 1.2, ease: 'power3' })

      function onMove(e: PointerEvent) {
        if (isAnimating.current) return
        const nx = (e.clientX / window.innerWidth - 0.5) * 2 // -1..1
        const ny = (e.clientY / window.innerHeight - 0.5) * 2
        xTo(nx * 18)
        rotTo(rotationRef.current + nx * 9)
        wordTo(nx * -26)
        artTo(nx * 34)
        glareTo(nx * 55)
        gsap.to(drinkWrapRef.current, { rotationX: -ny * 4, duration: 1.2, ease: 'power3' })
      }
      window.addEventListener('pointermove', onMove, { passive: true })

      /* Magnetic buttons: hover states tween with the same eases so nothing
         in the UI ever snaps. */
      const magnets = gsap.utils.toArray<HTMLElement>('[data-magnet]')
      const cleanups: Array<() => void> = []
      magnets.forEach((el) => {
        const mx = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3' })
        const my = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3' })
        const enter = () => gsap.to(el, { scale: 1.08, duration: 0.5, ease: 'arrive' })
        const move = (e: PointerEvent) => {
          const r = el.getBoundingClientRect()
          mx((e.clientX - (r.left + r.width / 2)) * 0.34)
          my((e.clientY - (r.top + r.height / 2)) * 0.34)
        }
        const leave = () => {
          mx(0)
          my(0)
          gsap.to(el, { scale: 1, duration: 0.7, ease: 'glide' })
        }
        el.addEventListener('pointerenter', enter)
        el.addEventListener('pointermove', move)
        el.addEventListener('pointerleave', leave)
        cleanups.push(() => {
          el.removeEventListener('pointerenter', enter)
          el.removeEventListener('pointermove', move)
          el.removeEventListener('pointerleave', leave)
        })
      })

      return () => {
        window.removeEventListener('pointermove', onMove)
        cleanups.forEach((fn) => fn())
      }
    }, rootRef)

    return () => ctx.revert()
  }, [])

  /* ---------------- the switch ---------------- */
  const switchProduct = useCallback(
    (dir: 1 | -1 = 1) => {
      if (isAnimating.current) {
        // buffer the click instead of ignoring it, so mashing the arrows
        // still feels responsive and never drops an interaction
        queued.current = dir
        return
      }
      isAnimating.current = true

      const current = rotationRef.current
      const next: ProductKey = active === 'coffee' ? 'matcha' : 'coffee'
      const target = current + 180 * dir
      rotationRef.current = target

      const DUR = 1.7 // longer = more luxurious; the eases keep it from dragging
      const MID = DUR * 0.5

      const incomingArt = next === 'coffee' ? coffeeArtRef.current : matchaArtRef.current
      const outgoingArt = next === 'coffee' ? matchaArtRef.current : coffeeArtRef.current
      const incomingRot = next === 'matcha' ? 8 : 0
      const slices = gsap.utils.toArray<HTMLElement>('.drink3d__slice')

      // pause the ambient breath so the two motions never fight each other,
      // then hand control back once the spin has fully settled
      idleTl.current?.pause()

      const tl = gsap.timeline({
        defaults: { ease: 'glide' },
        onComplete: () => {
          isAnimating.current = false
          // resume ambient motion from wherever the glass ended up
          gsap.set(drinkRef.current, { rotationY: target })
          idleTl.current?.play()
          if (queued.current) {
            const d = queued.current as 1 | -1
            queued.current = 0
            switchProduct(d)
          }
        },
      })

      tl
        /* ---- the spin: one weighted turn on a hand-authored curve ---- */
        .to(drinkRef.current, { rotationY: target, duration: DUR, ease: 'spin' }, 0)
        // arc of travel: lifts, floats, lands — sine halves join seamlessly
        .to(drinkWrapRef.current, { y: -46, duration: MID, ease: 'sine.out' }, 0)
        .to(drinkWrapRef.current, { y: 0, duration: MID, ease: 'sine.in' }, MID)
        // a whisper of scale so it reads as coming toward the viewer mid-turn
        .to(drinkWrapRef.current, { scale: 1.055, duration: MID, ease: 'sine.out' }, 0)
        .to(drinkWrapRef.current, { scale: 1, duration: MID, ease: 'sine.in' }, MID)
        // banking into the turn, like a real object with weight
        .to(drinkRef.current, { rotationZ: -5 * dir, duration: MID, ease: 'sine.out' }, 0)
        .to(drinkRef.current, { rotationZ: 0, duration: MID * 1.15, ease: 'glide' }, MID)
        // slices ripple outward from the centre — makes the surface feel liquid
        .to(
          slices,
          {
            scaleY: 1.045,
            duration: MID * 0.8,
            ease: 'sine.out',
            stagger: { each: 0.006, from: 'center', yoyo: true, repeat: 1 },
          },
          0,
        )
        // specular glare sweeps across as the glass turns through the light
        .fromTo(
          glareRef.current,
          { xPercent: -130, opacity: 0 },
          { xPercent: 130, opacity: 0.55, duration: DUR * 0.72, ease: 'silk' },
          0.06,
        )
        .to(glareRef.current, { opacity: 0, duration: 0.5 }, DUR * 0.7)
        // shadow tracks the lift: tightens + softens, then spreads back out
        .to(shadowRef.current, { scaleX: 0.38, opacity: 0.34, filter: 'blur(18px)', duration: MID, ease: 'sine.out' }, 0)
        .to(shadowRef.current, { scaleX: 1, opacity: 1, filter: 'blur(11px)', duration: MID, ease: 'sine.in' }, MID)

        /* ---- drink crossfade: opacity only, both images already decoded ----
           Centred on the midpoint and timed to sit under the brightest part of
           the glare sweep, so the two photos blend instead of hard-cutting. */
        .to(
          `.drink3d__layer[data-drink="${next}"]`,
          { opacity: 1, duration: 0.46, ease: 'sine.inOut' },
          MID - 0.23,
        )
        .to(
          `.drink3d__layer[data-drink="${active}"]`,
          { opacity: 0, duration: 0.46, ease: 'sine.inOut' },
          MID - 0.23,
        )

        /* ---- copy swap at the midpoint ----
           flushSync commits React's re-render synchronously inside this GSAP
           tick, so the new characters exist and can be hidden + animated before
           the browser ever paints. Without it React commits a frame later and
           the fresh, unstyled text pops in while the outgoing tween keeps
           animating detached nodes. */
        .call(
          () => {
            const title = titleRef.current
            flushSync(() => setActive(next))
            const chars = title?.querySelectorAll<HTMLElement>('.char__inner')
            if (chars?.length) {
              gsap.set(chars, { yPercent: 110, opacity: 0 })
              gsap.to(chars, {
                yPercent: 0,
                opacity: 1,
                duration: DUR * 0.62,
                ease: 'glide',
                stagger: 0.028,
              })
            }
          },
          undefined,
          MID,
        )

        /* ---- background word: scales out through blur, new one breathes in ---- */
        .to(
          bgWordRef.current,
          { opacity: 0, scale: 1.18, filter: 'blur(26px)', duration: MID, ease: 'silk' },
          0,
        )
        .fromTo(
          bgWordRef.current,
          { opacity: 0, scale: 0.88, filter: 'blur(26px)' },
          { opacity: 1, scale: 1, filter: 'blur(0px)', duration: DUR * 0.75, ease: 'glide' },
          MID,
        )

        /* ---- copy: per-character curtain out, per-character curtain in ---- */
        .to(
          '.hero-copy h1 .char__inner',
          { yPercent: -110, opacity: 0, duration: MID * 0.8, ease: 'silk', stagger: 0.018 },
          0,
        )
        .to([eyebrowRef.current, subtitleRef.current], { opacity: 0, y: -14, filter: 'blur(10px)', duration: MID * 0.75, ease: 'silk' }, 0)
        .fromTo(
          [eyebrowRef.current, subtitleRef.current],
          { opacity: 0, y: 16, filter: 'blur(10px)' },
          { opacity: 1, y: 0, filter: 'blur(0px)', duration: DUR * 0.6, ease: 'glide', stagger: 0.07 },
          MID + 0.08,
        )

        /* ---- particle art crossfade: old lifts away, new rains down ---- */
        .to(
          outgoingArt,
          { y: -110, opacity: 0, scale: 0.93, filter: 'blur(8px)', duration: MID * 1.05, ease: 'silk' },
          0,
        )
        .fromTo(
          incomingArt,
          { y: -190, opacity: 0, scale: 1.07, rotate: incomingRot - 7, filter: 'blur(8px)' },
          {
            y: 0,
            opacity: 0.84,
            scale: 1,
            rotate: incomingRot,
            filter: 'blur(0px)',
            duration: DUR * 0.78,
            ease: 'arrive',
          },
          MID * 0.82,
        )
        .set(outgoingArt, { filter: 'blur(0px)' })
    },
    [active],
  )

  return (
    <main className={`product-page ${product.theme}`} ref={rootRef}>
      <div ref={stageRef} className="page-inner">
        <header className="site-header">
          <a className="brand-mark stagger-in" href="#top" aria-label="Roast and Whisk home">
            <span /> <span />
          </a>
          <nav aria-label="Main navigation">
            <a className="stagger-in" href="#products">
              Products
            </a>
            <a className="stagger-in" href="#all-products">
              All products
            </a>
            <a className="stagger-in" href="#partnership">
              Partnership
            </a>
            <a className="stagger-in" href="#contact">
              Contact
            </a>
          </nav>
          <button className="bag-button stagger-in" data-magnet aria-label="Open shopping bag">
            <ShoppingBag size={17} strokeWidth={1.6} />
          </button>
        </header>

        <section className="hero" id="top" aria-label={`${product.title} product feature`}>
          <div className="background-word" aria-hidden="true" ref={bgWordRef}>
            {product.title}
          </div>

          <div className="hero-copy">
            <p className="eyebrow" ref={eyebrowRef}>
              Small batch / {product.index}
            </p>
            <h1 ref={titleRef} aria-label={product.name}>
              {splitChars(product.name)}
            </h1>
            <p ref={subtitleRef}>{product.subtitle}</p>
          </div>

          <div className="product-stage">
            <img
              ref={coffeeArtRef}
              className="particle-art particle-art--coffee"
              src="/images/coffee-particles-transparent.png"
              alt=""
              aria-hidden="true"
            />
            <img
              ref={matchaArtRef}
              className="particle-art particle-art--matcha"
              src="/images/matcha-particles-transparent.png"
              alt=""
              aria-hidden="true"
            />
            <div className="product-shadow" ref={shadowRef} />

            {/* parallax/float wrapper is separate from the rotation layer so the
                ambient breath and the spin can never overwrite each other */}
            <div className="drink3d-wrap" ref={drinkWrapRef}>
              <div className="drink3d" ref={drinkRef} role="img" aria-label={product.alt}>
                <div className="drink3d__hemi drink3d__hemi--front">{renderSlices(frontSlices, 'f')}</div>
                <div className="drink3d__hemi drink3d__hemi--back">{renderSlices(backSlices, 'b')}</div>
              </div>
              <div className="drink-glare" ref={glareRef} aria-hidden="true" />
            </div>

            <button
              className="nav-arrow nav-arrow--left"
              data-magnet
              onClick={() => switchProduct(-1)}
              aria-label="Previous drink"
            >
              <ArrowLeft size={19} />
            </button>
            <button
              className="nav-arrow nav-arrow--right"
              data-magnet
              onClick={() => switchProduct(1)}
              aria-label="Next drink"
            >
              <ArrowRight size={19} />
            </button>
          </div>
        </section>

        <footer className="page-footer">
          <span className="stagger-in">Roasted / whisked with intention</span>
          <span className="stagger-in">Scroll to explore ↓</span>
        </footer>
      </div>
    </main>
  )
}

export default ProductHero
