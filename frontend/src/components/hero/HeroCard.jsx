/**
 * @file HeroCard.jsx
 * Single card in the hero horizontal strip.
 * Text only for T-16: two-line Anton title and Archivo body.
 * (Icons and gradient reveal are deferred to T-17).
 */

export default function HeroCard({ title, body, index }) {
  const titleLines = Array.isArray(title) ? title : title.split('\n');

  return (
    <article className="hero-card" data-index={index}>
      <h3 className="hero-card-title">
        {titleLines.map((line, i) => (
          <span key={i} className="hero-card-title-line">
            {line}
          </span>
        ))}
      </h3>
      <p className="hero-card-body">{body}</p>
    </article>
  );
}
