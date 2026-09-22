export default function RoastFlower({smile=false, mood='idle'}) {
  return <svg className={`roast-flower mood-${mood}`} viewBox="0 0 200 220" role="img" aria-label={smile ? 'A pleased Meadow flower' : 'A skeptical Meadow flower'}>
    <path d="M102 151q-8 32-1 58M102 187q-32-5-39-28 26-2 39 28M101 179q28-29 43-21-8 23-43 21" fill="#7f956d" stroke="#496745" strokeWidth="5" strokeLinecap="round"/>
    <g fill="#f6c87b" stroke="#dfac5a" strokeWidth="2">{Array.from({length:8},(_,i)=><ellipse key={i} cx="100" cy="50" rx="24" ry="40" transform={`rotate(${i*45} 100 98)`}/>)}</g>
    <circle cx="100" cy="98" r="48" fill="#563e32"/>
    <path d="M68 86l24-5M111 77l23 7" stroke="#fff5d8" strokeWidth="5" strokeLinecap="round"/>
    <ellipse cx="83" cy="99" rx="4" ry="7" fill="#fff5d8"/><ellipse cx="121" cy="97" rx="4" ry="7" fill="#fff5d8"/>
    <path d={smile ? 'M86 118q17 19 32-2' : 'M85 124q17-8 30-3'} fill="none" stroke="#fff5d8" strokeWidth="4" strokeLinecap="round"/>
  </svg>;
}

