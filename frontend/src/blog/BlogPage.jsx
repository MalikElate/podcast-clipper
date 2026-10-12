import { useState } from 'react';
import SiteHeader from '../components/SiteHeader.jsx';
import SiteFooter from '../components/SiteFooter.jsx';
import { appHref } from '../siteUrls.js';
import { schemaScriptProps } from '../siteSchema.js';
import { BLOG_ARTICLES } from './articles.js';
import { BLOG_HUB, findContentPage } from './catalog.js';

const absolute = path => `https://findmeadow.com${path}/`;
const dateLabel = value => new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
const publishingGuide = { path: '/blog/post-to-social-media-with-ai-agents', headline: 'Post to social media with AI agents', description: 'Connect an AI client to Meadow, prepare a draft, and follow each destination through publishing.', category: 'Publishing' };

function StructuredData({ page }) {
  const isHub = page.kind === 'blog-hub', isArticle = Boolean(page.slug);
  const breadcrumbs = [{ '@type': 'ListItem', position: 1, name: 'Meadow', item: 'https://findmeadow.com/' }];
  if (isArticle) breadcrumbs.push({ '@type': 'ListItem', position: 2, name: 'Guides', item: absolute('/blog') });
  breadcrumbs.push({ '@type': 'ListItem', position: breadcrumbs.length + 1, name: isHub ? 'Guides' : page.headline, item: absolute(page.path) });
  const graph = [{ '@type': 'BreadcrumbList', itemListElement: breadcrumbs }];
  if (isHub) graph.push({ '@type': 'CollectionPage', name: page.headline, url: absolute(page.path), mainEntity: { '@type': 'ItemList', itemListElement: [...BLOG_ARTICLES, publishingGuide].map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.headline, url: absolute(item.path) })) } });
  else if (isArticle) graph.push({ '@type': 'Article', headline: page.headline, description: page.description, url: absolute(page.path), mainEntityOfPage: absolute(page.path), datePublished: page.published, dateModified: page.updated, author: { '@type': 'Organization', name: 'Meadow', url: 'https://findmeadow.com/' }, publisher: { '@type': 'Organization', name: 'Meadow', url: 'https://findmeadow.com/' } });
  else graph.push({ '@type': 'WebPage', name: page.headline, description: page.description, url: absolute(page.path) });
  if (page.faq?.length) graph.push({ '@type': 'FAQPage', mainEntity: page.faq.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
  return <script {...schemaScriptProps({ '@context': 'https://schema.org', '@graph': graph })} />;
}

function GuideList({ articles }) {
  return <div className="blog-list">{articles.map(article => <a className="blog-list-item" href={`${article.path}/`} key={article.path}><div><h2>{article.headline}</h2><p>{article.description}</p></div><span aria-hidden="true">↗</span></a>)}</div>;
}

function Hub() {
  const [query, setQuery] = useState(''), [category, setCategory] = useState('All guides');
  const articles = [...BLOG_ARTICLES, publishingGuide];
  const categories = ['All guides', ...new Set(articles.map(article => article.category))];
  const filtered = articles.filter(article => (category === 'All guides' || article.category === category) && `${article.headline} ${article.description}`.toLowerCase().includes(query.toLowerCase()));
  return <><div className="ft-search-bar"><div className="ft-tabs" role="group" aria-label="Guide categories">{categories.map(name => <button type="button" key={name} aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}</div><input type="search" aria-label="Find a guide" placeholder="Find a guide…" value={query} onChange={e => setQuery(e.target.value)} /></div><GuideList articles={filtered} />{!filtered.length && <p role="status" className="ft-empty">No guides match that search. Try another topic.</p>}</>;
}

function ArticleSections({ page }) {
  return <div className="blog-layout"><aside className="blog-contents"><nav aria-label="On this page"><h2>On this page</h2>{page.sections.map(section => <a key={section.id} href={`#${section.id}`}>{section.heading}</a>)}{page.sources?.length > 0 && <a href="#sources">Sources and further reading</a>}</nav></aside><div className="blog-body">{page.sections.map(section => <section key={section.id} id={section.id}><h2>{section.heading}</h2>{section.paragraphs?.map((paragraph, i) => <p key={i}>{paragraph}</p>)}{section.steps?.length > 0 && <ol className="blog-steps">{section.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>}{section.table && <div className="blog-table-wrap"><table><caption className="sr-only">{section.heading}</caption><thead><tr>{section.table.headers.map(heading => <th scope="col" key={heading}>{heading}</th>)}</tr></thead><tbody>{section.table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => j === 0 ? <th scope="row" key={j}>{cell}</th> : <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>}{section.links?.length > 0 && <div className="blog-section-links">{section.links.map(link => <a key={link.href} href={link.href}>{link.label} ↗</a>)}</div>}</section>)}
    {page.faq?.length > 0 && <section className="ft-faq"><h2>Common questions</h2>{page.faq.map(({ q, a }) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</section>}
    {page.sources?.length > 0 && <section id="sources" className="blog-sources"><h2>Sources and further reading</h2><p>Platform features and eligibility can change. Follow the platform’s current instructions for your account. This guide was reviewed on {dateLabel(page.updated)}.</p><div className="blog-section-links">{page.sources.map(source => <a href={source.href} key={source.href}>{source.label} ↗</a>)}</div></section>}
  </div></div>;
}

export default function BlogPage({ page: suppliedPage, path }) {
  const page = suppliedPage || findContentPage(path);
  const isHub = page === BLOG_HUB, isArticle = Boolean(page.slug);
  const related = isArticle ? BLOG_ARTICLES.filter(article => article !== page && article.category === page.category).slice(0, 3) : [];
  return <div className="app"><div className="centered-shell landing-shell"><div className="landing landing-v2 ft-page blog-page"><SiteHeader /><main className="ft-main"><StructuredData page={page} />
    <nav className="ft-breadcrumbs" aria-label="Breadcrumb"><a href="/">Meadow</a><span aria-hidden="true">/</span>{isArticle && <><a href="/blog/">Guides</a><span aria-hidden="true">/</span></>}<span>{isHub ? 'Guides' : isArticle ? page.category : 'Analytics'}</span></nav>
    <article><header className={`ft-heading blog-heading ${isHub ? 'ft-hub-heading' : ''}`}><h1>{page.headline}</h1><p>{page.intro}</p>{isArticle && <p className="blog-byline">By Meadow · Reviewed <time dateTime={page.updated}>{dateLabel(page.updated)}</time></p>}{page.kind === 'analytics' && <a className="ft-button" href={appHref('/dashboard/analytics')}>Open your analytics ↗</a>}</header>
    {isHub ? <Hub /> : <ArticleSections page={page} />}</article>
    {page.relatedTools?.length > 0 && <section className="blog-tools"><h2>Put it into practice.</h2><div className="ft-guide-links">{page.relatedTools.map(tool => <a href={tool.href} key={tool.href}>{tool.label}<span aria-hidden="true">↗</span></a>)}</div></section>}
    {related.length > 0 && <section className="ft-related"><div className="ft-section-heading"><h2>Keep reading.</h2><a href="/blog/">All guides ↗</a></div><GuideList articles={related} /></section>}
    <section className="ft-cta"><div><h2>{isHub ? 'Make your next post.' : 'Ready to put it into practice?'}</h2><p>Prepare your content, connect your channels, and plan your publishing in Meadow.</p></div><a className="ft-button" href={appHref('/dashboard')}>Start posting ↗</a></section>
  </main><SiteFooter /></div></div></div>;
}
