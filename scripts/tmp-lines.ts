import { OPENINGS } from '../src/data/openings'
for (const id of process.argv.slice(2)) {
  const d = OPENINGS.find((o) => o.id === id || o.name.toLowerCase().startsWith(id))
  if (!d) { console.log('?? ' + id); continue }
  console.log(`\n## ${d.id} (${d.side}) ${d.name}`)
  for (const l of d.lines) console.log('  ' + l.replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' '))
}
