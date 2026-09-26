import { useState } from 'react';
import SiteHeader from '../components/SiteHeader.jsx';
import SiteFooter from '../components/SiteFooter.jsx';
import { appHref } from '../siteUrls.js';
import { FREE_TOOLS, GUIDES_HUB, MEDIA_GUIDES, TOOLS_HUB } from './freeToolsCatalog.js';
import ImageTools from './ImageTools.jsx';
import { CaptionGenerator, HandleChecker, LinkedInFormatter, UtmBuilder, YouTubeTagGenerator, YouTubeTitleChecker } from './TextTools.jsx';

const href = page => `${page.path}/`;
const absolute = page => `https://findmeadow.com${href(page)}`;
const roast = { path: '/tiktok-roast', name: 'TikTok Niche or Not', category: 'Writing', description: 'Get a playful review of public TikTok captions, with practical ideas for your next post.' };
const items = [...FREE_TOOLS, roast, { ...GUIDES_HUB, category: 'Guides' }];

function StructuredData({ page }) {
  const breadcrumbs = [{ '@type': 'ListItem', position: 1, name: 'Meadow', item: 'https://findmeadow.com/' }, { '@type': 'ListItem', position: 2, name: TOOLS_HUB.name, item: absolute(TOOLS_HUB) }];
  if (page !== TOOLS_HUB) breadcrumbs.push({ '@type': 'ListItem', position: 3, name: page.name, item: absolute(page) });
  const graph = [{ '@type': 'BreadcrumbList', itemListElement: breadcrumbs }];
  if (page === TOOLS_HUB || page === GUIDES_HUB) graph.push({ '@type': 'CollectionPage', name: page.name, description: page.description, url: absolute(page), mainEntity: { '@type': 'ItemList', itemListElement: (page === TOOLS_HUB ? items : MEDIA_GUIDES).map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, url: absolute(item) })) } });
  else if (page.platform) graph.push({ '@type': 'Article', headline: page.name, description: page.description, url: absolute(page), author: { '@type': 'Organization', name: 'Meadow', url: 'https://findmeadow.com/' } });
  else graph.push({ '@type': 'WebApplication', name: page.name, url: absolute(page), description: page.description, applicationCategory: page.category === 'Images' ? 'MultimediaApplication' : 'UtilitiesApplication', operatingSystem: 'Any', browserRequirements: 'Requires JavaScript and a modern browser', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } });
  if (page.faq) graph.push({ '@type': 'FAQPage', mainEntity: page.faq.map(([question, answer]) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } })) });
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c') }} />;
}

function ToolList({ entries }) {
  return <div className="ft-tool-list">{entries.map(item => <a className="ft-tool-link" href={href(item)} key={item.path}><div><h3>{item.name}</h3><p>{item.description}</p></div><span aria-hidden="true">↗</span></a>)}</div>;
}

function Hub() {
  const [query, setQuery] = useState(''), [category, setCategory] = useState('All tools');
  const filtered = items.filter(item => (category === 'All tools' || item.category === category) && `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <div className="ft-search-bar"><div className="ft-tabs" role="group" aria-label="Tool categories">{['All tools', 'Images', 'Writing', 'Planning', 'Guides'].map(name => <button key={name} type="button" aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}</div><input type="search" aria-label="Find a tool" placeholder="Find a tool…" value={query} onChange={e => setQuery(e.target.value)} /></div>
    <ToolList entries={filtered} />
    {!filtered.length && <p className="ft-empty" role="status">No matching tools. Try another word or choose All tools.</p>}
    <section className="ft-guide-section"><div className="ft-section-heading"><h2>The right size for every feed.</h2><a href={href(GUIDES_HUB)}>All media-size guides ↗</a></div><p>Useful canvases for your next post, with dimensions, aspect ratios, and a crop preset ready to use.</p><div className="ft-guide-links">{MEDIA_GUIDES.map(guide => <a key={guide.path} href={href(guide)}>{guide.platform}<span aria-hidden="true">↗</span></a>)}</div></section>
    <section className="ft-editorial"><h2>Make something worth posting.</h2><p>Prepare the image, find the words, and give your links a little structure. These tools are free to use without a Meadow account. Image editing happens in your browser; AI writing and profile lookups use a rate-limited service.</p><p>When the post is ready, Meadow brings your drafts, connected channels, and publishing schedule together in one workspace.</p></section>
  </>;
}

function MediaTable({ guide }) {
  return <div className="ft-table-wrap"><table><caption>{guide.platform} working dimensions</caption><thead><tr><th scope="col">Format</th><th scope="col">Dimensions</th><th scope="col">Ratio</th><th scope="col"><span className="sr-only">Crop image</span></th></tr></thead><tbody>{guide.rows.map(([label, width, height, ratio], index) => <tr key={label}><th scope="row">{label}</th><td>{width} × {height} px</td><td>{ratio}</td><td><a href={`/free-tools/social-media-image-cropper/?preset=${guide.slug}-${index}`} aria-label={`Crop an image for ${guide.platform} ${label}`}>Use size ↗</a></td></tr>)}</tbody></table></div>;
}

function Guides({ page }) {
  const guides = page.platform ? [page] : MEDIA_GUIDES;
  return <>
    {!page.platform && <div className="ft-guide-links">{MEDIA_GUIDES.map(guide => <a key={guide.slug} href={`#${guide.slug}`}>{guide.platform}</a>)}</div>}
    <p className="ft-hint">Working canvas recommendations, not a list of every upload limit. Check the platform and publishing method before exporting. Reviewed September 2026.</p>
    {guides.map(guide => <section className="ft-guide-section" id={guide.slug} key={guide.slug}>{!page.platform && <h2><a href={href(guide)}>{guide.platform} image and video sizes ↗</a></h2>}<MediaTable guide={guide} /><div className="ft-editorial"><h2>Leave room for the crop.</h2><p>{guide.note}</p><p>Work from a high-resolution original and keep important text away from the edges. Cropping changes the framing; resizing changes the pixel dimensions. A larger export will not recover detail that is missing from the source.</p><a href={guide.source} target="_blank" rel="noopener noreferrer">{guide.sourceLabel} ↗</a></div></section>)}
    {page.platform && <section className="ft-guide-section"><h2>Explore other platforms</h2><div className="ft-guide-links">{MEDIA_GUIDES.filter(guide => guide !== page).map(guide => <a key={guide.slug} href={href(guide)}>{guide.platform} ↗</a>)}</div></section>}
  </>;
}

function Tool({ page }) {
  switch (page.slug) {
    case 'utm-builder': return <UtmBuilder />;
    case 'social-media-image-cropper': return <ImageTools mode="crop" />;
    case 'instagram-grid-maker': return <ImageTools mode="grid" />;
    case 'instagram-carousel-splitter': return <ImageTools mode="carousel" />;
    case 'instagram-handle-checker': return <HandleChecker platform="instagram" />;
    case 'tiktok-username-checker': return <HandleChecker platform="tiktok" />;
    case 'tiktok-caption-generator': return <CaptionGenerator />;
    case 'linkedin-text-formatter': return <LinkedInFormatter />;
    case 'youtube-title-checker': return <YouTubeTitleChecker />;
    case 'youtube-tag-generator': return <YouTubeTagGenerator />;
    default: return null;
  }
}

export default function FreeToolsPage({ page }) {
  const isHub = page === TOOLS_HUB;
  const isGuide = page === GUIDES_HUB || Boolean(page.platform);
  const related = FREE_TOOLS.filter(tool => tool !== page).sort((a, b) => Number(b.category === page.category) - Number(a.category === page.category)).slice(0, 4);
  return <div className="app"><div className="centered-shell landing-shell"><div className="landing landing-v2 ft-page">
    <SiteHeader />
    <main className="ft-main"><StructuredData page={page} />
      <nav className="ft-breadcrumbs" aria-label="Breadcrumb"><a href="/">Meadow</a><span aria-hidden="true">/</span>{isHub ? <span>Free tools</span> : <><a href="/free-tools/">Free tools</a><span aria-hidden="true">/</span>{page.platform && <><a href={href(GUIDES_HUB)}>Media sizes</a><span aria-hidden="true">/</span></>}<span>{page.name}</span></>}</nav>
      <header className={`ft-heading ${isHub ? 'ft-hub-heading' : ''}`}><h1>{page.name}</h1><p>{isHub ? 'A little help for your next post. Create, crop, format, and plan with tools that are free for everyone.' : page.intro || page.description}</p>{!isGuide && <span className="ft-hint">Free to use. No signup required.</span>}</header>
      {isHub ? <Hub /> : isGuide ? <Guides page={page} /> : <><noscript><p className="ft-error">Enable JavaScript to use the interactive tool. The guide and frequently asked questions are available below.</p></noscript><Tool page={page} /><div className="ft-editorial ft-tool-guide">{page.sections.map(([heading, text]) => <section key={heading}><h2>{heading}</h2><p>{text}</p></section>)}</div><section className="ft-faq"><h2>Questions about {page.name.toLowerCase()}</h2>{page.faq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section><section className="ft-related"><div className="ft-section-heading"><h2>Keep creating.</h2><a href="/free-tools/">All free tools ↗</a></div><ToolList entries={related} /></section></>}
      <section className="ft-cta"><div><h2>Ready for the next post?</h2><p>Bring your content and channels together in Meadow.</p></div><a className="ft-button" href={appHref('/dashboard')}>Start posting ↗</a></section>
    </main>
    <SiteFooter />
  </div></div></div>;
}
