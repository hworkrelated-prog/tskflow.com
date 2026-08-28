"""Soonest-due dashboard column + Delegated rename."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
JS = ROOT / "frontend" / "src" / "lib" / "dashboardColumns.js"
HUB = ROOT / "frontend" / "src" / "pages" / "TaskHub.js"


def test_source_uses_delegated_and_swipe_shell():
    hub = HUB.read_text(encoding="utf-8")
    css = (ROOT / "frontend" / "src" / "index.css").read_text(encoding="utf-8")
    assert "Delegated" in hub
    assert "Nothing delegated" in hub
    assert "dashboard-panels" in hub
    assert "dashboard-column-tab-${tab.id}" in hub
    assert "columnWithSoonestDue" in hub
    assert "Sent</CardTitle>" not in hub
    assert "scroll-snap-type: x mandatory" in css


def test_column_with_soonest_due():
    src = JS.read_text(encoding="utf-8").replace("export function", "function").replace("export const", "const")
    script = src + r"""
const fail = (m) => { console.error(m); process.exit(1); };
const eq = (a, b, m) => { if (a !== b) fail(m + ' got ' + a + ' expected ' + b); };

eq(columnWithSoonestDue([{items:[]},{items:[]},{items:[]}]), 0, 'all empty');
eq(columnWithSoonestDue([
  {items:[{due_date:'2026-09-01'}]},
  {items:[{due_date:'2026-08-01'}]},
  {items:[]},
]), 1, 'personal sooner than to-me');
eq(columnWithSoonestDue([
  {items:[{due_date:'2099-01-01'}]},
  {items:[]},
  {items:[{due_date:'2020-01-01'}]},
]), 2, 'overdue delegated wins');
eq(columnWithSoonestDue([
  {items:[{title:'no due'}]},
  {items:[{due_date:'2026-08-20'}]},
  {items:[]},
]), 1, 'undated to-me loses to dated personal');
eq(columnWithSoonestDue([
  {items:[]},
  {items:[{title:'only personal'}]},
  {items:[]},
]), 1, 'first non-empty if no dates');
console.log('ok');
"""
    subprocess.run(["node", "-e", script], check=True, cwd=str(ROOT))
