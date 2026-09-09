export function Icon({ name, size = 20, ...props }) {
  const paths = {
    compose: <><path d="M12 20H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"/><path d="m16 3 5 5-9 9-5 1 1-5Z"/></>,
    queue: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18M8 15h3M8 18h7"/></>,
    media: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/></>,
    clips: <><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8 8 13 13M8 16 13 11M15 9l6-6"/></>,
    analytics: <><path d="M4 3v17h17M9 15V9M14 15V5M19 15v-4"/></>,
    accounts: <><path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 1)"/></>,
    plus: <path d="M12 5v14M5 12h14"/>, arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>, check: <path d="m4 12 5 5L20 6"/>,
    download: <><path d="M12 3v13m-5-5 5 5 5-5M3 16v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 8a8 8 0 0 1 14-2l1 6M4 12l1 6a8 8 0 0 0 14-2"/></>,
    chevron: <path d="m8 10 4 4 4-4"/>, menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
    up: <path d="m5 14 7-7 7 7"/>, down: <path d="m5 10 7 7 7-7"/>,
    external: <><path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.compose}</svg>;
}
export function BridgeMark() { return <svg width="31" height="31" viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect width="32" height="32" rx="9" fill="currentColor"/><path d="M8 23V15a8 8 0 0 1 16 0v8M8 17h16M13 17v6m6-6v6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/></svg>; }
