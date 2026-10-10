"""Aangan Studio call agent — component map, swimlane grid, A3 landscape PDF."""
import sys
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color
from reportlab.pdfbase.pdfmetrics import stringWidth

OUT = sys.argv[1]

PW, PH = 1190.55, 841.89          # A3 landscape
M = 22                            # page margin

INK      = HexColor('#1f2933')
MUTED    = HexColor('#667481')
HEADBG   = HexColor('#2d3a46')
GRIDLINE = HexColor('#dfe3e8')
LANELINE = HexColor('#c9d0d8')
WHITE    = HexColor('#ffffff')

# pastel families, matching the reference legend
AI_F,  AI_S  = HexColor('#e2dbf7'), HexColor('#b4a7e6')
SYS_F, SYS_S = HexColor('#dbe9f6'), HexColor('#a5c6e2')
OUT_F, OUT_S = HexColor('#d8edde'), HexColor('#a6d3b7')
HUM_F, HUM_S = HexColor('#fdeed0'), HexColor('#efcd90')
CUT_F, CUT_S = HexColor('#fbdedb'), HexColor('#eda9a1')

LANE_TINTS = [HexColor('#fbfcfd'), HexColor('#f5f7f9')]

COLS = ['Actor / Platform', 'Trigger', 'Input', 'Context', 'Processing', 'AI', 'Output']
ACTOR_W = 146
GAP = 6

c = canvas.Canvas(OUT, pagesize=(PW, PH))
c.setTitle('Aangan Studio - Phone enquiry component map')
c.setAuthor('Aaditaa Vashisht')
c.setSubject('MESA Case 03 - AI call agent component map')


# ---------------------------------------------------------------- text helpers
def wrap(text, font, size, maxw):
    out, line = [], ''
    for word in text.split():
        trial = (line + ' ' + word).strip()
        if stringWidth(trial, font, size) <= maxw or not line:
            line = trial
        else:
            out.append(line)
            line = word
    if line:
        out.append(line)
    return out


def block(x, cy, width, lines, font, size, lead, color, align='center'):
    total = len(lines) * lead
    y = cy + total / 2 - lead + (lead - size) / 2 + 1
    c.setFont(font, size)
    c.setFillColor(color)
    for ln in lines:
        if align == 'center':
            c.drawCentredString(x + width / 2, y, ln)
        else:
            c.drawString(x, y, ln)
        y -= lead
    return total


def cell(x, y, w, h, title, body=None, fill=None, stroke=None,
         tfont='Helvetica-Bold', tsize=7.6, bsize=6.7):
    """Rounded box, bold title over optional muted body. Returns its box."""
    if fill is not None:
        c.setFillColor(fill)
        c.setStrokeColor(stroke or fill)
        c.setLineWidth(0.7)
        c.roundRect(x, y, w, h, 4, fill=1, stroke=1)
    pad = 6
    tl = wrap(title, tfont, tsize, w - 2 * pad)
    bl = wrap(body, 'Helvetica', bsize, w - 2 * pad) if body else []
    th, bh = len(tl) * (tsize + 1.6), len(bl) * (bsize + 1.5)
    cy = y + h / 2 + (bh / 2 if bl else 0)
    block(x + pad, cy, w - 2 * pad, tl, tfont, tsize, tsize + 1.6, INK)
    if bl:
        block(x + pad, cy - th / 2 - bh / 2 + 1, w - 2 * pad, bl,
              'Helvetica', bsize, bsize + 1.5, MUTED)
    return (x, y, w, h)


# ---------------------------------------------------------------- arrows
def arrow(x1, y1, x2, y2, dashed=False, col=None):
    col = col or HexColor('#7b8793')
    c.setStrokeColor(col)
    c.setLineWidth(0.9)
    c.setDash([2.2, 2.2] if dashed else [])
    c.line(x1, y1, x2, y2)
    c.setDash([])
    # head
    import math
    a = math.atan2(y2 - y1, x2 - x1)
    L, W = 5.0, 2.6
    c.setFillColor(col)
    p = c.beginPath()
    p.moveTo(x2, y2)
    p.lineTo(x2 - L * math.cos(a) + W * math.sin(a), y2 - L * math.sin(a) - W * math.cos(a))
    p.lineTo(x2 - L * math.cos(a) - W * math.sin(a), y2 - L * math.sin(a) + W * math.cos(a))
    p.close()
    c.drawPath(p, fill=1, stroke=0)


def connect(a, b, dashed=False):
    """Horizontal arrow between two boxes, from a's right edge to b's left."""
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    arrow(ax + aw + 1.5, ay + ah / 2, bx - 2.5, by + bh / 2, dashed)


# ---------------------------------------------------------------- geometry
title_h = 40
head_y = PH - M - title_h - 24
head_h = 23
deploy_h = 50
legend_h = 18

grid_top = head_y
grid_bottom = M + legend_h + 10 + deploy_h + 10
usable_w = PW - 2 * M
col_w = (usable_w - ACTOR_W) / (len(COLS) - 1)


def colx(i):
    return M + (0 if i == 0 else ACTOR_W + (i - 1) * col_w)


def colw(i):
    return ACTOR_W if i == 0 else col_w


# ---------------------------------------------------------------- title
c.setFillColor(INK)
c.setFont('Times-Bold', 23)
c.drawString(M, PH - M - 23, 'Aangan Studio  ·  Phone enquiry component map')
c.setFont('Helvetica', 8.6)
c.setFillColor(MUTED)
c.drawString(M, PH - M - 36,
             'MESA Case 03  ·  every call answered, qualified against Nikhil’s rubric, booked during the call — and never a price quoted')

c.setFont('Times-Bold', 12.5)
c.setFillColor(INK)
c.drawRightString(PW - M, PH - M - 18, 'AANGAN STUDIO')
c.setFont('Helvetica', 6.4)
c.setFillColor(MUTED)
c.drawRightString(PW - M, PH - M - 28, 'I N T E R I O R   D E S I G N   ·   P U N E')

# ---------------------------------------------------------------- column header
c.setFillColor(HEADBG)
c.roundRect(M, head_y - head_h, usable_w, head_h, 3, fill=1, stroke=0)
c.setFont('Helvetica-Bold', 8.4)
for i, name in enumerate(COLS):
    c.setFillColor(WHITE)
    c.drawCentredString(colx(i) + colw(i) / 2, head_y - head_h + 7.6, name)
    if i:
        c.setStrokeColor(HexColor('#46535f'))
        c.setLineWidth(0.6)
        c.line(colx(i), head_y - head_h + 3, colx(i), head_y - 3)

# ---------------------------------------------------------------- lanes
LANES = [
    dict(actor='Customer / Caller', sub='Prospective client', icon='phone'),
    dict(actor='Vaani AI', sub='Live voice agent', icon='wave'),
    dict(actor='Webhook', sub='Next.js on Vercel', icon='gear'),
    dict(actor='Classifier', sub='Gemini Flash', icon='spark'),
    dict(actor='The Cut', sub='Price filter (code)', icon='shield', cut=True),
    dict(actor='Handoff', sub='Resend + HubSpot', icon='send'),
    dict(actor='Supabase', sub='Database + metrics', icon='db'),
    dict(actor='Nikhil / Founder', sub='Dashboard', icon='chart'),
]

lane_h = (grid_top - head_h - grid_bottom) / len(LANES)
cell_h = lane_h - 2 * GAP


def lane_y(i):
    return grid_top - head_h - (i + 1) * lane_h


for i, lane in enumerate(LANES):
    y = lane_y(i)
    c.setFillColor(LANE_TINTS[i % 2] if not lane.get('cut') else HexColor('#fdf6f5'))
    c.rect(M, y, usable_w, lane_h, fill=1, stroke=0)
    c.setStrokeColor(GRIDLINE)
    c.setLineWidth(0.5)
    c.line(M, y, M + usable_w, y)

# vertical column separators across the whole grid
for i in range(1, len(COLS)):
    c.setStrokeColor(GRIDLINE)
    c.setLineWidth(0.5)
    c.line(colx(i), grid_bottom, colx(i), grid_top - head_h)
c.setStrokeColor(LANELINE)
c.setLineWidth(0.8)
c.line(colx(1), grid_bottom, colx(1), grid_top - head_h)
c.rect(M, grid_bottom, usable_w, grid_top - head_h - grid_bottom, fill=0, stroke=1)


# ---------------------------------------------------------------- icons
def icon(kind, x, y, col):
    c.saveState()
    c.setStrokeColor(col)
    c.setFillColor(col)
    c.setLineWidth(1.2)
    if kind == 'phone':
        c.circle(x, y, 5.2, fill=0, stroke=1)
        c.setLineWidth(1.6)
        c.line(x - 2, y + 1.6, x + 1.4, y - 2.2)
    elif kind == 'wave':
        for k, hgt in enumerate([3, 6, 4.2, 7, 3.4]):
            c.setLineWidth(1.5)
            c.line(x - 5 + k * 2.6, y - hgt / 2, x - 5 + k * 2.6, y + hgt / 2)
    elif kind == 'gear':
        c.circle(x, y, 4.6, fill=0, stroke=1)
        c.circle(x, y, 1.6, fill=1, stroke=0)
    elif kind == 'spark':
        for (dx, dy) in [(0, 6), (0, -6), (6, 0), (-6, 0)]:
            c.setLineWidth(1.3)
            c.line(x, y, x + dx * .8, y + dy * .8)
    elif kind == 'shield':
        p = c.beginPath()
        p.moveTo(x, y + 6); p.lineTo(x + 5, y + 2.5); p.lineTo(x + 5, y - 2)
        p.lineTo(x, y - 6); p.lineTo(x - 5, y - 2); p.lineTo(x - 5, y + 2.5)
        p.close(); c.drawPath(p, fill=0, stroke=1)
    elif kind == 'send':
        p = c.beginPath()
        p.moveTo(x - 5.5, y + 4); p.lineTo(x + 6, y); p.lineTo(x - 5.5, y - 4)
        p.lineTo(x - 3, y); p.close(); c.drawPath(p, fill=1, stroke=0)
    elif kind == 'db':
        for off in (3.4, 0, -3.4):
            c.ellipse(x - 5.4, y + off - 1.5, x + 5.4, y + off + 1.5, fill=0, stroke=1)
    elif kind == 'chart':
        for k, hgt in enumerate([4, 7.5, 5.6]):
            c.rect(x - 5.4 + k * 4.0, y - 5, 2.8, hgt, fill=1, stroke=0)
    c.restoreState()


ICON_COL = {
    0: HexColor('#5b6b7a'), 1: HexColor('#8b79d4'), 2: HexColor('#4f8fc0'),
    3: HexColor('#8b79d4'), 4: HexColor('#c0564c'), 5: HexColor('#d2a04a'),
    6: HexColor('#4f8fc0'), 7: HexColor('#4a9b70'),
}

for i, lane in enumerate(LANES):
    y = lane_y(i)
    icon(lane['icon'], M + 16, y + lane_h / 2 + 2, ICON_COL[i])
    c.setFillColor(INK)
    c.setFont('Helvetica-Bold', 8.4)
    c.drawString(M + 29, y + lane_h / 2 + 3.2, lane['actor'])
    c.setFillColor(MUTED)
    c.setFont('Helvetica', 6.5)
    c.drawString(M + 29, y + lane_h / 2 - 5.4, lane['sub'])


# ---------------------------------------------------------------- lane content
def put(lane_i, col_i, title, body=None, fill=SYS_F, stroke=SYS_S, hfrac=1.0, yoff=0):
    y = lane_y(lane_i) + GAP
    h = cell_h * hfrac
    return cell(colx(col_i) + GAP, y + (cell_h - h) / 2 + yoff,
                colw(col_i) - 2 * GAP, h, title, body, fill, stroke)


B = {}
# --- 0 caller
B['c_trig'] = put(0, 1, 'Calls the studio', 'any hour, any day', HUM_F, HUM_S)
B['c_in']   = put(0, 2, 'Name, space, locality,\nscope, timeline'.replace('\n', ' '),
                  'decision-maker; may ask the price', HUM_F, HUM_S)
B['c_out']  = put(0, 6, 'Spoken enquiry', None, OUT_F, OUT_S)

# --- 1 vaani
B['v_trig'] = put(1, 1, 'Call connects', 'SIP participant joins the room')
B['v_in']   = put(1, 2, 'Live audio')
B['v_ctx']  = put(1, 3, 'Agent prompt', 'seven questions + Nikhil’s five checks')
B['v_proc'] = put(1, 4, 'Answers, qualifies,\noffers two slots'.replace('\n', ' '))
B['v_ai']   = put(1, 5, 'Vaani voice agent', 'deflects every pricing question', AI_F, AI_S)
B['v_out']  = put(1, 6, 'Transcript, summary,\nentities, recording'.replace('\n', ' '),
                  None, OUT_F, OUT_S)

# --- 2 webhook
B['w_trig'] = put(2, 1, 'call_started, then\ncall_postprocessing'.replace('\n', ' '))
B['w_in']   = put(2, 2, 'Unsigned POST', 'secret travels in the URL as ?token=')
B['w_ctx']  = put(2, 3, 'room_name is the call id', 'event inferred from payload shape')
B['w_proc'] = put(2, 4, 'Authenticate, normalise,\ncheck idempotency'.replace('\n', ' '))
B['w_out']  = put(2, 6, 'Call row opened', 'before anything can fail', OUT_F, OUT_S)

# --- 3 classifier
B['g_trig'] = put(3, 1, 'Transcript available')
B['g_in']   = put(3, 2, 'Full transcript')
B['g_ctx']  = put(3, 3, 'qualified.md + services.md',
                  'verbatim · pricing.md never loaded', CUT_F, CUT_S)
B['g_proc'] = put(3, 4, 'Classify against the\nfive criteria'.replace('\n', ' '))
B['g_ai']   = put(3, 5, 'Gemini Flash', 'JSON mode · temperature 0', AI_F, AI_S)
B['g_out']  = put(3, 6, 'qualified / not_fit /\ncomplaint / unclear'.replace('\n', ' '),
                  '+ deciding criterion + 8-line note', OUT_F, OUT_S)

# --- 4 THE CUT
B['p_trig'] = put(4, 1, 'Any model output', None, CUT_F, CUT_S)
B['p_in']   = put(4, 2, 'fit_reason, criterion,\nhandoff note'.replace('\n', ' '), None, CUT_F, CUT_S)
B['p_ctx']  = put(4, 3, 'A budget the caller\nvolunteered is allowed'.replace('\n', ' '),
                  'it is their statement, not ours', CUT_F, CUT_S)
B['p_proc'] = put(4, 4, 'Strip every studio-voiced figure',
                  'a not_fit citing price is overruled', CUT_F, CUT_S)
B['p_out']  = put(4, 6, 'Text carrying no price',
                  '+ redaction audit on the row', OUT_F, OUT_S)

# --- 5 handoff
B['h_trig'] = put(5, 1, 'Verdict is qualified', None, HUM_F, HUM_S)
B['h_in']   = put(5, 2, 'Lead fields, note,\nHMAC-signed links'.replace('\n', ' '), None, HUM_F, HUM_S)
B['h_ctx']  = put(5, 3, 'Designer chosen by\nspecialty (home / office)'.replace('\n', ' '), None, HUM_F, HUM_S)
B['h_proc'] = put(5, 4, 'Email the designer,\ncreate a HubSpot deal'.replace('\n', ' '),
                  'independent — one failing never blocks the other', HUM_F, HUM_S)
B['h_out']  = put(5, 6, 'Designer gets the brief',
                  'Claim · Reschedule · booking link', OUT_F, OUT_S, hfrac=0.52,
                  yoff=cell_h * 0.24)
B['h_esc']  = put(5, 6, 'complaint → front desk, a human calls back',
                  None, CUT_F, CUT_S, hfrac=0.40, yoff=-cell_h * 0.30)

# --- 6 supabase
B['s_trig'] = put(6, 1, 'Every event')
B['s_in']   = put(6, 2, 'Call log, verdict,\ncosts, transcript'.replace('\n', ' '))
B['s_ctx']  = put(6, 3, 'RLS on, service role only', 'the browser never reads it')
B['s_proc'] = put(6, 4, 'Upsert the row', 'a database failure never loses the lead')
B['s_out']  = put(6, 6, 'Persistent call record', None, OUT_F, OUT_S)

# --- 7 dashboard
B['n_trig'] = put(7, 1, 'Opens the dashboard')
B['n_in']   = put(7, 2, 'daily_metrics view')
B['n_proc'] = put(7, 4, 'Aggregate the month')
B['n_out']  = put(7, 6, 'Calls, after-hours share, qualified,\nbooked, show-ups, running cost'.replace('\n', ' '),
                  'and how many prices were blocked', OUT_F, OUT_S)

# ---------------------------------------------------------------- flow arrows
connect(B['c_trig'], B['c_in'])
connect(B['v_ctx'], B['v_proc'])
connect(B['v_proc'], B['v_ai'])
connect(B['v_ai'], B['v_out'])
connect(B['w_trig'], B['w_in'])
connect(B['w_in'], B['w_ctx'])
connect(B['w_ctx'], B['w_proc'])
connect(B['g_in'], B['g_ctx'])
connect(B['g_ctx'], B['g_proc'])
connect(B['g_proc'], B['g_ai'])
connect(B['g_ai'], B['g_out'])
connect(B['p_in'], B['p_ctx'])
connect(B['p_ctx'], B['p_proc'])
connect(B['h_in'], B['h_ctx'])
connect(B['h_ctx'], B['h_proc'])
connect(B['s_in'], B['s_ctx'])
connect(B['s_ctx'], B['s_proc'])
connect(B['n_trig'], B['n_in'])


def vdrop(a, b, dashed=False):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    x = min(ax + aw / 2, bx + bw / 2)
    arrow(x, ay, x, by + bh + 2, dashed)


def plain(x1, y1, x2, y2, dashed=False, col=None):
    col = col or HexColor('#7b8793')
    c.setStrokeColor(col)
    c.setLineWidth(0.9)
    c.setDash([2.2, 2.2] if dashed else [])
    c.line(x1, y1, x2, y2)
    c.setDash([])


def route(a, b, dashed=False):
    """Orthogonal lane-to-lane connector: out of a, along the gutter, down into b."""
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    sx, tx = ax + aw / 2, bx + bw / 2
    top_b = by + bh
    gut = (ay + top_b) / 2            # gutter between the two lanes
    if abs(sx - tx) < 1.5:
        arrow(sx, ay, tx, top_b + 2, dashed)
        return
    plain(sx, ay, sx, gut, dashed)     # down out of the source
    plain(sx, gut, tx, gut, dashed)    # across the gutter
    arrow(tx, gut, tx, top_b + 2, dashed)  # down into the target


def route_side(a, b, dashed=False):
    """Out of a's right edge, across, then down into b's top."""
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    y = ay + ah / 2
    tx = bx + bw / 2
    plain(ax + aw + 2, y, tx, y, dashed)
    arrow(tx, y, tx, by + bh + 2, dashed)


# caller -> vaani -> webhook -> classifier -> cut -> handoff
route_side(B['c_in'], B['v_ai'])
vdrop(B['v_out'], B['w_out'])
route(B['w_proc'], B['g_in'])
vdrop(B['g_out'], B['p_out'])
route(B['p_proc'], B['h_in'])
connect(B['h_proc'], B['h_out'])
route(B['h_proc'], B['s_in'])
connect(B['s_proc'], B['s_out'], dashed=True)
vdrop(B['s_out'], B['n_out'], dashed=True)
connect(B['n_proc'], B['n_out'])

# ---------------------------------------------------------------- deployment strip
dy = M + legend_h + 10
c.setFillColor(HexColor('#f7f9fa'))
c.setStrokeColor(GRIDLINE)
c.setLineWidth(0.7)
c.roundRect(M, dy, usable_w, deploy_h, 4, fill=1, stroke=1)

icon('gear', M + 20, dy + deploy_h / 2, HexColor('#5b6b7a'))
c.setFillColor(INK)
c.setFont('Helvetica-Bold', 8.4)
c.drawString(M + 33, dy + deploy_h / 2 + 2.6, 'Deployment')
c.setFillColor(MUTED)
c.setFont('Helvetica', 6.5)
c.drawString(M + 33, dy + deploy_h / 2 - 6, 'and evidence')

dw, dh = 150, 26
dcy = dy + (deploy_h - dh) / 2
start = M + 150
steps = [
    ('GitHub', 'private repo · 45 tests'),
    ('Vercel', 'Next.js 16, production'),
    ('Supabase', 'Mumbai · RLS on'),
    ('Live dashboard', 'basic auth'),
    ('Eval: 20 / 20', 'real September enquiries'),
]
prev = None
for k, (t, s) in enumerate(steps):
    x = start + k * (dw + 28)
    box = cell(x, dcy, dw, dh, t, s, WHITE, LANELINE, tsize=7.6, bsize=6.3)
    if prev:
        connect(prev, box)
    prev = box

# ---------------------------------------------------------------- legend
ly = M + 3
items = [
    (AI_F, AI_S, 'AI component'),
    (SYS_F, SYS_S, 'System step'),
    (OUT_F, OUT_S, 'Output'),
    (HUM_F, HUM_S, 'Human step / handoff'),
    (CUT_F, CUT_S, 'The Cut · escalation'),
]
x = M
for fill, stroke, label in items:
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(0.7)
    c.roundRect(x, ly, 15, 9, 2, fill=1, stroke=1)
    c.setFillColor(MUTED)
    c.setFont('Helvetica', 7)
    c.drawString(x + 20, ly + 2.2, label)
    x += 26 + stringWidth(label, 'Helvetica', 7) + 18

arrow(x, ly + 4.5, x + 26, ly + 4.5)
c.setFillColor(MUTED)
c.setFont('Helvetica', 7)
c.drawString(x + 31, ly + 2.2, 'Main flow')
x += 31 + stringWidth('Main flow', 'Helvetica', 7) + 18
arrow(x, ly + 4.5, x + 26, ly + 4.5, dashed=True)
c.drawString(x + 31, ly + 2.2, 'Data flow')

c.setFillColor(MUTED)
c.setFont('Helvetica', 6.6)
c.drawRightString(PW - M, ly + 2.2,
                  'Scope: incoming phone calls. WhatsApp and the web form reuse every component except the trigger.')

c.showPage()
c.save()
print('wrote', OUT)
