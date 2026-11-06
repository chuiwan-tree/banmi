// 半米：一间食堂。人自己找路、排队、找座。推一张桌子，看后面跟着变什么。
// 浏览器和 node 都能用。
(function (root) {
const W = 22, H = 14;
const DOOR = [1, 12];
const RICE = [[5, 2], [9, 2]];   // 打饭窗口前站的格（老李在 9,1 那个窗口）
const SOUP = [[14, 2]];
const WATER = [[19, 4]];
const SUN = [];                   // 窗边那几格，太阳照得到
for (let x = 18; x <= 20; x++) for (let y = 11; y <= 12; y++) SUN.push([x, y]);

const NAMES = ['林小满','沈一禾','陈默','周跃','许棠','王一鸣','赵晴','孙皓','李果','吴桐',
  '郑朗','冯小雨','褚亮','卫青青','蒋树','韩露','杨帆','朱可','秦川','何苗',
  '吕安','施雯','张驰','孔令','曹悦','严冬','华子','金铃','魏然','陶陶',
  '方圆','马骁','邓佳','任重','袁满','柳絮','唐糖','宋词','范小舟','苏北','白露','高远','罗兰','葛优优'];

const NEW_NAMES = ['乔一','叶知秋','安然','夏至','程橙','言溪','季风','闻笛','钟晚','温酒','易水','常青','池鱼','楚歌','黎明','路遥'];
function hash() { // 几个整数 -> [0,1)
  let h = 2166136261;
  for (const a of arguments) { h ^= (a | 0) + 0x9e3779b9; h = Math.imul(h, 16777619); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; }
  return (h >>> 0) / 4294967296;
}

function defaultTables() {
  const t = [];
  for (const y of [5, 8, 11]) for (const x of [3, 7, 11, 15]) t.push({ x, y });
  t.push({ x: 18, y: 11 }); // 靠窗那一张，压着太阳
  return t;
}

function seatsOf(tb) { return [[tb.x, tb.y - 1], [tb.x + 1, tb.y - 1], [tb.x, tb.y + 1], [tb.x + 1, tb.y + 1]]; }

class World {
  constructor(seed, n) {
    this.seed = seed; this.day = 0;
    this.tables = defaultTables();
    n = n || 44;
    this.people = [];
    for (let i = 0; i < n; i++) {
      this.people.push({ id: i, name: NAMES[i % NAMES.length],
        shy: hash(seed, i, 1) < 0.3,          // 怕生：宁可坐空桌
        water: hash(seed, i, 2) < 0.4,        // 习惯先接水
        soup: hash(seed, i, 3) < 0.5,
        habit: null });                         // 平时坐的 [桌号, 座号]
    }
    this.fam = {};      // "a,b" -> 熟悉度
    this.friends = {};  // "a,b" -> 第几天成了朋友
    this.log = [];      // 每天的事
    this.history = [];  // 每天谁坐哪
    this.liHappy = false;
  }
  key(a, b) { return a < b ? a + ',' + b : b + ',' + a; }
  isFriend(a, b) { return this.key(a, b) in this.friends; }
  clone() {
    const w = new World(this.seed, 1);
    w.day = this.day; w.tables = this.tables.map(t => ({ ...t }));
    w.people = this.people.map(p => ({ ...p, habit: p.habit && p.habit.slice() }));
    w.fam = { ...this.fam }; w.friends = { ...this.friends };
    w.log = this.log.slice(); w.history = this.history.slice(); w.liHappy = this.liHappy;
    return w;
  }

  // 地图：0 地，1 墙/桌/窗口
  grid() {
    const g = [];
    for (let y = 0; y < H; y++) { g.push([]); for (let x = 0; x < W; x++) g[y].push(x == 0 || y == 0 || x == W - 1 || y == H - 1 ? 1 : 0); }
    g[DOOR[1]][0] = 1;
    for (const tb of this.tables) { g[tb.y][tb.x] = 1; g[tb.y][tb.x + 1] = 1; }
    return g;
  }
  canPlace(i, x, y) {
    if (x < 1 || x + 1 > W - 2 || y < 2 || y > H - 2) return false;
    const cells = [[x, y], [x + 1, y]];
    for (const [cx, cy] of cells) {
      if (cx == DOOR[0] && cy == DOOR[1]) return false;
      for (const s of [...RICE, ...SOUP, ...WATER]) if (s[0] == cx && s[1] == cy) return false;
      for (let j = 0; j < this.tables.length; j++) { if (j == i) continue; const t = this.tables[j];
        if (t.y == cy && (t.x == cx || t.x + 1 == cx)) return false; }
    }
    return true;
  }

  field(g, tx, ty) { // 到 (tx,ty) 的步数
    const d = []; for (let y = 0; y < H; y++) d.push(new Array(W).fill(1e9));
    const q = [[tx, ty]]; d[ty][tx] = 0;
    for (let qi = 0; qi < q.length; qi++) { const [x, y] = q[qi];
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || g[ny][nx] || d[ny][nx] <= d[y][x] + 1) continue;
        d[ny][nx] = d[y][x] + 1; q.push([nx, ny]); } }
    return d;
  }

  // 过一顿午饭。返回每一步的样子（给网页放动画用）。
  runDay(record) {
    const day = ++this.day, seed = this.seed;
    const g = this.grid();
    const fcache = {};
    const F = (x, y) => fcache[x + ',' + y] || (fcache[x + ',' + y] = this.field(g, x, y));
    const seats = []; this.tables.forEach((tb, ti) => seatsOf(tb).forEach(([x, y], si) => {
      if (x > 0 && y > 0 && x < W - 1 && y < H - 1 && !g[y][x] && !seats.some(o => o.x == x && o.y == y)) seats.push({ ti, si, x, y, who: -1 }); }));
    const events = [];
    const say = (t, s) => events.push({ t, s });

    // 每个礼拜一，有人转走，有人转来
    if (day > 1 && day % 7 == 1) {
      const stay = this.people.filter(p => !p.left);
      const go = stay[Math.floor(hash(seed, day, 31) * stay.length)];
      go.left = day;
      for (const k in this.friends) if (k.split(',').includes(String(go.id))) delete this.friends[k];
      const id = this.people.length;
      const np = { id, name: NEW_NAMES[(id - 44) % NEW_NAMES.length] || ('新' + id), shy: hash(seed, id, 1) < 0.6,
        water: hash(seed, id, 2) < 0.4, soup: hash(seed, id, 3) < 0.5, habit: null, isNew: day };
      this.people.push(np);
      say(0, `${go.name}转走了。新转来一个${np.name}${np.shy ? '，不太爱说话' : ''}`);
    }

    // 麻雀：窗边有没有一块空地晒得到太阳
    const sunFree = SUN.filter(([x, y]) => !g[y][x]).length;
    const sparrowSun = sunFree == SUN.length;
    const liHappy = sparrowSun;   // 麻雀不来偷馒头，老李就不用追，心情好
    if (sparrowSun) say(0, `窗边空出 ${sunFree} 格太阳，麻雀在那儿晒着，没去偷馒头`);
    else say(0, `麻雀从窗缝钻进来，去偷二号窗口的馒头，老李追了它一中午`);
    if (liHappy && !this.liHappy) say(0, `老李今天心情好，每人多打一勺土豆`);
    this.liHappy = liHappy;
    const eatBase = liHappy ? 40 : 30; // 土豆多，吃得久

    const ps = this.people.map(p => {
      const st = { p, x: DOOR[0], y: DOOR[1], arrive: Math.floor(hash(seed, day, p.id, 9) * 60),
        plan: [], stage: 0, wait: 0, blocked: 0, seat: null, wet: false, done: false, inside: false };
      st.plan.push(['rice', RICE[p.id % 2]]);
      if (p.soup) st.plan.push(['soup', SOUP[0]]);
      if (p.water) st.plan.unshift(['water', WATER[0]]);
      st.plan.push(['seat', null]); st.plan.push(['out', DOOR]);
      if (p.left || hash(seed, day, p.id, 5) < 0.08) { st.done = true; st.absent = true; } // 今天没来
      return st;
    });
    const occ = {}; const O = (x, y) => occ[x + ',' + y];
    const frames = [];
    const clock = t => { const m = 20 + Math.floor(t / 6); return `12:${String(m).padStart(2, '0')}`; };

    const chooseSeat = st => {
      const p = st.p; let best = null, bs = -1e9;
      const here = F(st.x, st.y); // 不对称：用到座位的距离，借座位那张场
      for (const s of seats) {
        if (s.who >= 0) continue;
        const d = F(s.x, s.y)[st.y][st.x]; if (d >= 1e9) continue;
        let sc = -d * 0.5;
        const mates = seats.filter(o => o.ti == s.ti && o.who >= 0).map(o => o.who);
        for (const m of mates) sc += this.isFriend(p.id, m) ? 30 : (p.shy ? -6 : 1);
        if (p.habit && p.habit[0] == s.ti && p.habit[1] == s.si) sc += 12;
        else if (p.habit && p.habit[0] == s.ti) sc += 5;
        sc += hash(seed, day, p.id, s.ti * 4 + s.si) * 2;
        if (sc > bs) { bs = sc; best = s; }
      }
      return best;
    };

    for (let t = 0; t < 400; t++) {
      let alive = 0;
      // 打乱谁先走，但只按固定的 hash，不吃随机数
      const order = ps.map((s, i) => i).sort((a, b) => hash(seed, day, t, a) - hash(seed, day, t, b));
      for (const i of order) {
        const st = ps[i]; if (st.done) continue; alive++;
        if (t < st.arrive) continue;
        if (!st.inside) { if (O(DOOR[0], DOOR[1]) !== undefined) continue; st.inside = true; occ[DOOR + ''] = i; }
        if (st.wait > 0) { st.wait--; continue; }
        const [kind, tgt0] = st.plan[st.stage];
        let tgt = tgt0;
        if (kind == 'seat') {
          if (!st.seat) { const s = chooseSeat(st); if (!s) { st.seat = 'none'; } else { s.who = i; st.seat = s; } }
          tgt = st.seat == 'none' ? DOOR : [st.seat.x, st.seat.y];
        }
        if (st.x == tgt[0] && st.y == tgt[1]) {
          if (kind == 'rice' || kind == 'soup') { st.wait = 4; st.stage++; }
          else if (kind == 'water') { st.wait = 2; st.stage++; st.carry = true; }
          else if (kind == 'seat') {
            if (st.seat == 'none') { say(t, `${clock(t)} ${st.p.name}没找到座位，端着走了`); }
            else st.wait = eatBase + Math.floor(hash(seed, day, i, 7) * 10);
            st.stage++; st.carry = false;
          } else if (kind == 'out') { st.done = true; delete occ[st.x + ',' + st.y]; }
          continue;
        }
        const d = F(tgt[0], tgt[1]);
        let best = null, bd = d[st.y][st.x];
        const opts = [[1,0],[-1,0],[0,1],[0,-1]].map(([dx, dy]) => [st.x + dx, st.y + dy])
          .filter(([x, y]) => d[y] && d[y][x] < 1e9);
        for (const [x, y] of opts) if (d[y][x] < bd && O(x, y) === undefined) { bd = d[y][x]; best = [x, y]; }
        if (!best && st.blocked > 2) // 堵久了，往旁边绕
          for (const [x, y] of opts) if (d[y][x] == d[st.y][st.x] && O(x, y) === undefined) { best = [x, y]; break; }
        if (!best && st.blocked >= 3) { // 挤过去：跟挡路的人换个位置（正在打饭、吃饭的不让）
          for (const [x, y] of opts) { if (d[y][x] >= d[st.y][st.x]) continue; const j = O(x, y); const o = ps[j];
            if (o.wait > 0) continue;
            const ok = o.stage < o.plan.length && !(o.plan[o.stage][0] == 'seat' && o.seat && o.seat.x == x && o.seat.y == y);
            if (!ok) continue;
            o.x = st.x; o.y = st.y; occ[o.x + ',' + o.y] = j;
            st.x = x; st.y = y; occ[x + ',' + y] = i; st.blocked = 0; st.squeezed = j; best = 'swap'; break; }
          if (best == 'swap') continue;
        }
        if (!best) {
          st.blocked++;
          // 端着水被堵在人后面，挤一下，可能洒
          if (st.carry && st.blocked == 3 && hash(seed, day, st.p.id, 12) < 0.04) {
            for (const [x, y] of opts) { const j = O(x, y); if (j === undefined) continue;
              if (true) {
                const o = ps[j]; st.carry = false; o.wet = true;
                const k = this.key(st.p.id, o.p.id); this.fam[k] = (this.fam[k] || 0) + 2;
                say(t, `${clock(t)} ${st.p.name}被挤了一下，半杯热水洒在${o.p.name}背上`);
                break; } }
          }
          continue;
        }
        st.blocked = 0;
        delete occ[st.x + ',' + st.y]; st.x = best[0]; st.y = best[1]; occ[st.x + ',' + st.y] = i;
      }
      if (record) frames.push(ps.map(s => s.inside && !s.done ? [s.x, s.y, s.carry ? 1 : 0, s.stage >= s.plan.length - 1 ? 2 : 0] : null));
      if (!alive) break;
    }

    // 吃饭时同桌的人熟一点
    const byTable = {};
    for (const s of seats) if (s.who >= 0) (byTable[s.ti] = byTable[s.ti] || []).push(s.who);
    const today = {};
    for (const s of seats) if (s.who >= 0) today[s.who] = [s.ti, s.si];
    for (const ti in byTable) { const m = byTable[ti];
      for (let a = 0; a < m.length; a++) for (let b = a + 1; b < m.length; b++) {
        const k = this.key(m[a], m[b]); this.fam[k] = (this.fam[k] || 0) + (liHappy ? 1.3 : 1);
        if (this.fam[k] >= 4 && !(k in this.friends)) {
          this.friends[k] = day; say(999, `${this.people[m[a]].name}和${this.people[m[b]].name}熟了`); }
      } }
    // 今天没坐一起的，慢慢生分；朋友生分得慢，可也会
    const together = {};
    for (const ti in byTable) { const m = byTable[ti];
      for (let a = 0; a < m.length; a++) for (let b = a + 1; b < m.length; b++) together[this.key(m[a], m[b])] = 1; }
    for (const k in this.fam) {
      if (k in this.friends) {
        this.fam[k] = Math.min(this.fam[k], 8);
        if (!together[k]) { this.fam[k] *= 0.9;
          if (this.fam[k] < 2) { delete this.friends[k]; const [a, b] = k.split(',');
            say(999, `${this.people[a].name}和${this.people[b].name}好久没一起吃饭，不怎么说话了`); } }
      } else if (!together[k]) this.fam[k] *= 0.85;
    }
    // 习惯：今天坐哪，明天还想坐哪
    for (const p of this.people) if (today[p.id]) p.habit = today[p.id];
    for (const p of this.people) if (p.isNew && !p.left && day - p.isNew < 7) {
      const fr = this.people.filter(o => o.id != p.id && this.isFriend(o.id, p.id)).length;
      const t = today[p.id]; const mates = t ? byTable[t[0]].length - 1 : -1;
      if (mates == 0) say(999, `${p.name}来的第 ${day - p.isNew + 1} 天，还是一个人坐一张桌子`); }
    const alone = Object.values(byTable).filter(m => m.length == 1).map(m => this.people[m[0]].name);
    if (alone.length) say(999, `一个人吃饭的：${alone.join('、')}`);
    this.history.push(today);
    this.log.push({ day, events });
    return frames;
  }
}

// 两个世界比一比：只差你推过的那几下
function diff(a, b) {
  const fa = Object.keys(a.friends), fb = Object.keys(b.friends);
  const onlyA = fa.filter(k => !(k in b.friends)), onlyB = fb.filter(k => !(k in a.friends));
  const ta = a.history[a.history.length - 1] || {}, tb = b.history[b.history.length - 1] || {};
  let moved = 0; for (const p of a.people) { const x = ta[p.id], y = tb[p.id];
    if (String(x) != String(y)) moved++; }
  return { onlyA, onlyB, moved };
}

const api = { World, diff, W, H, DOOR, RICE, SOUP, WATER, SUN, seatsOf, NAMES };
if (typeof module !== 'undefined') module.exports = api; else root.BanMi = api;
})(this);
