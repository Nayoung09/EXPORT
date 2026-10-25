/* 바우처 서비스 추천 화면
   판정과 순위는 기획안 6-2(추천 조건), 6-3(등급, 가산점, 서비스 정렬) 규칙으로 계산한다.
   추천 이유 문장은 판정에 쓴 키 값만으로 만든 템플릿이다(실제 서비스에서는 6-5 D1의 AI 문장 생성과 검증). */
(function () {
  'use strict';
  const D = window.DATA;
  const T = D.types;
  const R1 = D.R1, CORE = D.STAGE_CORE;
  const FTA = new Set(D.FTA), NON_EN = new Set(D.NON_EN);
  const TIER_BASE = { 1: 30, 2: 20, 3: 10 };
  const TIER_NAME = { 1: '필수', 2: '단계 핵심', 3: '실무 지원' };
  const STAGES = ['내수기업', '수출초보', '수출유망', '수출성장', '수출강소'];
  const CASES = [
    { id: 'CO-032', label: 'CO-032 내수기업' },
    { id: 'CO-028', label: 'CO-028 수출유망' },
    { id: 'CO-056', label: 'CO-056 수출성장' },
  ];
  // 서비스 태그(권역 표기)와 기업 국가를 맞추기 위한 별칭. 자료 B의 태그 표기를 기준으로 함
  const ALIAS = {
    '미국': ['미국', '북미'], '캐나다': ['캐나다', '북미'], '독일': ['독일', 'EU', '유럽'], '프랑스': ['프랑스', 'EU', '유럽'],
    '영국': ['영국', '유럽'], '인도네시아': ['인도네시아', '동남아', '이슬람권'], '말레이시아': ['말레이시아', '동남아', '이슬람권'],
    '베트남': ['베트남', '동남아'], '태국': ['태국', '동남아'], '필리핀': ['필리핀', '동남아'], '싱가포르': ['싱가포르', '동남아'],
    '아랍에미리트': ['아랍에미리트', '중동', '이슬람권'], '카자흐스탄': ['카자흐스탄', '유라시아경제연합'],
  };
  const ITEM_FILTER = new Set(['T01', 'T02', 'T05', 'T06', 'T07', 'T08', 'T15']);
  const OWN_ASK = {
    T01: '이 인증을 이미 보유하고 있나요?', T02: '이 시스템 인증을 이미 보유하고 있나요?',
    T03: '진출국에 등록한 상표, 특허가 있나요? (실제 서비스는 특허청 공개 데이터로 조회)',
    T09: '외국어 홍보 영상이 이미 있나요?', T11: '외국어 카탈로그가 이미 있나요?', T14: '해외용 브랜드명, CI가 이미 있나요?',
  };

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => (n == null ? '-' : Number(n).toLocaleString('ko-KR'));
  const josa = (w, a, b) => { const ch = w.charCodeAt(w.length - 1); return w + (ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28 ? a : b); };

  let company = null, st = null, prevRank = null, openScore = new Set();

  function fresh(c) {
    return { K06: c.K06.slice(), item: c.conflict ? 'both' : null, K11: null, K12: null, K13: null, K14: null,
      K16: new Set(), Q2: null, Q4: null, owned: new Set(), expanded: new Set() };
  }

  function keys() {
    const c = company;
    let K03 = c.K03;
    if (c.conflict && st.item === 'hs') K03 = [c.hsCat];
    if (c.conflict && st.item === 'prod') { const p = c.prodCat.filter((g) => g !== c.hsCat); K03 = p.length ? p : c.prodCat; }
    const K08 = st.K06.filter((x) => !c.K07.includes(x));
    return { K01: c.stage, K02: c.ind === '제조' ? '제조' : '비제조', K03, K04: c.K04, K05: c.K05, K06: st.K06, K07: c.K07, K08,
      K09: c.K09, K10: c.K10, K11: st.K11, K12: st.K12, K13: st.K13, K14: st.K14, K15: c.K15, K16: st.K16 };
  }

  /* ---------- 6-2, 6-3 추천 계산 ---------- */
  function recommend(k) {
    const out = [], check = [];
    const s = k.K01, idx = STAGES.indexOf(s), real = k.K04 === '실물';
    const add = (t, tier, bonus, why, basis) => {
      const tierIn = tier;
      if (tier !== 1 && CORE[s].includes(t)) tier = 2;
      const b = bonus.filter((x) => x[0] > 0);
      const pts = Math.min(9, b.reduce((a, x) => a + x[0], 0));
      out.push({ t, tier, score: TIER_BASE[tier] + pts, why, basis, bonus: b, coreLift: tierIn !== tier });
    };
    if (real) {
      if (k.K06.length) {
        const hits = [];
        k.K06.forEach((c) => { if (R1[c]) k.K03.forEach((g) => { if (R1[c][g]) hits.push([c, R1[c][g]]); }); });
        const nh = hits.filter((h) => k.K08.includes(h[0]));
        const unknown = k.K06.filter((c) => !R1[c]);
        const bonus = [[k.K08.length ? 1 : 0, '신규 진출국'], [k.K05.length ? 1 : 0, '신규 품목']];
        if (nh.length) add('T01', 1, bonus, `새로 진출하는 ${[...new Set(nh.map((h) => h[0]))].join(', ')}에서 ${k.K03.join(', ')} 품목은 ${nh.map((h) => h[0] + ' ' + h[1]).join(', ')} 인증이 필요합니다.`, ['진출희망국 20', '품목군 HS, 18, 6', '국가별 인증표(가정)']);
        else if (hits.length) add('T01', 3, bonus, `이미 수출 중인 국가의 인증(${hits.map((h) => h[0] + ' ' + h[1]).join(', ')})입니다. 보유 여부를 확인하세요.`, ['현재 수출국 시스템']);
        else if (unknown.length) check.push(['T01', `${unknown.join(', ')}의 품목별 인증 요건이 국가별 인증표에 아직 없습니다. 운영자 확인 후 추천됩니다.`]);
      } else check.push(['T01', '진출희망국이 비어 있어 필요한 인증을 판단할 수 없습니다.']);
    }
    const sys = k.K03.filter((g) => ['의료기기', '화장품', '식품'].includes(g));
    if (sys.length) add('T02', k.K03.includes('의료기기') ? 1 : 3, [], `${sys.join(', ')} 품목은 해외 바이어나 인허가에서 품질, 안전 관리체계 인증을 요구하는 경우가 많습니다.`, ['품목군']);
    if (k.K08.length) add('T03', 3, [[k.K13 === true ? 1 : 0, '연구개발 인력']], `새로 진출하는 ${k.K08.join(', ')}에 상표와 특허를 먼저 확보해 두어야 현지에서 권리를 지킬 수 있습니다.`, ['신규 진출국 20 − 19']);
    if (k.K02 === '제조') {
      if (k.K13 === null) check.push(['T04', '연구개발 인력(신청서 16번)이 있으면 특허 조사와 분쟁 대응이 추천됩니다.']);
      else if (k.K13) add('T04', 3, [[k.K07.length ? 1 : 0, '현재 수출 중']], '연구개발 인력이 있는 제조기업은 수출국의 특허 침해 위험을 미리 확인해야 합니다.', ['연구개발 인력 16', '업종 4']);
    }
    if (['내수기업', '수출초보'].includes(s) || k.K08.length) {
      add('T05', 3, [[s === '내수기업' ? 2 : s === '수출초보' ? 1 : 0, '성장단계 초기'], [k.K11 === 0 ? 1 : 0, '수출업력 0년']],
        k.K06.length ? `${(k.K08.length ? k.K08 : k.K06).join(', ')} 시장의 규모, 경쟁, 규제를 먼저 확인해야 진출 순서를 정할 수 있습니다.` : '아직 수출 실적과 진출희망국이 없어, 어느 시장으로 나갈지 먼저 정해야 합니다.',
        ['성장단계 시스템', '신규 진출국']);
    }
    if (idx <= 2) add('T06', 3, [[k.K10 ? 1 : 0, '간접수출 의존'], [k.K12 === 0 ? 1 : 0, '해외마케팅 인력 0명']],
      k.K10 ? '수출의 절반 이상이 무역상사를 거칩니다. 직접 거래할 바이어가 필요합니다.' : (k.K09 ? '거래처를 늘려 다음 성장단계로 가는 데 필요합니다.' : '수출 실적이 없어 첫 거래처가 필요합니다.'), ['성장단계 시스템', '수출액 10, 11']);
    if (k.K06.length) add('T07', 3, [[k.K08.length ? 1 : 0, '신규 진출국']], `${k.K06.join(', ')}에서 열리는 전시회로 현지 바이어를 직접 만날 수 있습니다.`, ['진출희망국 20', '품목군']);
    if (s !== '내수기업') add('T08', 3, [], st.Q2 === 'B2B' ? '기업 고객 대상 채널(링크드인, 바이어 타깃 광고) 위주로 보여줍니다.' : `${josa(s, '은', '는')} 진출국 대상 온라인 노출을 늘리는 단계입니다.`, ['성장단계 시스템', '진출희망국 20']);
    if (idx <= 2) add('T09', 3, [], '해외 바이어에게 보낼 회사, 제품 소개 영상이 필요한 단계입니다.', ['성장단계 시스템']);
    if (k.K14 === null && st.Q4 === null) check.push(['T10', '외국어 홈페이지(신청서 22번)가 없거나 온라인으로 판매한다면 웹, 상세페이지 제작이 추천됩니다.']);
    else if (k.K14 === false || st.Q4 === true) add('T10', 3, [], k.K14 === false ? '외국어 홈페이지가 없습니다. 바이어가 회사를 확인하는 첫 창구입니다.' : '온라인으로 판매하므로 외국어 상세페이지가 필요합니다.', [k.K14 === false ? '외국어 홈페이지 22' : '판매 채널 확인']);
    if (['내수기업', '수출초보'].includes(s) && real) add('T11', 3, [], '첫 영업에 쓸 외국어 카탈로그와 제품 자료가 필요합니다.', ['성장단계 시스템']);
    if (real) {
      if (st.Q2 === null) check.push(['T12', '해외 소비자에게 직접 판매하는 완제품(B2C)이면 포장디자인이 추천됩니다.']);
      else if (st.Q2 === 'B2C') add('T12', 3, [[k.K05.length ? 1 : 0, '신규 품목']], '소비자에게 판매하는 제품은 현지 시장에 맞는 포장이 필요합니다.', ['거래형태 확인']);
    }
    if (real && k.K05.length) add('T13', 3, [], `계획 품목에 새 품목(${k.K05.join(', ')})이 있습니다.`, ['계획 품목 18 − 현재 품목 17']);
    if (['내수기업', '수출초보'].includes(s)) add('T14', 3, [], '해외에서 쓸 브랜드명과 CI를 먼저 정해야 상표 출원과 홍보물이 이어집니다.', ['성장단계 시스템']);
    if (k.K06.length) {
      const ne = k.K06.filter((c) => NON_EN.has(c));
      add('T15', 3, [[ne.length ? 1 : 0, '비영어권 국가']], ne.length ? `희망국에 비영어권 국가(${ne.join(', ')})가 있습니다.` : '진출국 언어로 영업 자료와 계약서를 준비해야 합니다.', ['진출희망국 20']);
    }
    if (k.K11 === null && k.K12 === null) check.push(['T16', '해외마케팅 인력(15번)이나 수출업력(13번)이 적으면 무역실무, 해외영업 교육이 추천됩니다.']);
    else if ((k.K12 !== null && k.K12 <= 1) || (k.K11 !== null && k.K11 <= 2)) add('T16', 3, [[s === '내수기업' ? 1 : 0, '성장단계 초기']], '수출 실무를 맡을 내부 인력이나 경험이 적습니다.', ['해외마케팅 인력 15', '수출업력 13']);
    if (real && (k.K09 || s !== '내수기업')) add('T17', 3, [[k.K16.has('국제운송') ? 2 : 0, '한도확대 희망 국제운송']], k.K09 ? '직수출 실적이 있고 물량 관리가 필요한 단계입니다.' : '첫 선적을 앞둔 단계입니다.', ['직수출 10', '성장단계']);
    if (real && k.K09) add('T18', 3, [], '자사 명의 수출이 있어 통관과 관세환급을 챙겨야 합니다.', ['직수출 10']);
    const fta = k.K07.filter((c) => FTA.has(c));
    if (real && k.K09 && fta.length) add('T19', 3, [], `FTA 체결국(${fta.join(', ')})에 직수출 중입니다.`, ['현재 수출국 시스템', '직수출 10', 'FTA 체결국(가정)']);
    if (['수출성장', '수출강소'].includes(s) || k.K15) add('T20', 3, [[k.K15 ? 1 : 0, '현지법인 있음']], k.K15 ? '현지법인이 있어 현지 법무, 세무 수요가 있습니다.' : '수출 규모가 커져 현지 거점과 계약 관리가 필요한 단계입니다.', ['성장단계', '현지법인']);
    if (real && k.K07.includes('미국') && k.K09) add('T21', 3, [[k.K16.has('관세대응') ? 2 : 0, '한도확대 희망 관세대응']], '미국에 직수출 중입니다. 관세대응 자격이 확인되면 관세 영향 진단을 검토할 수 있습니다.', ['현재 수출국 시스템']);

    const core = CORE[s], ci = (t) => (core.indexOf(t) < 0 ? 99 : core.indexOf(t));
    out.sort((a, b) => b.score - a.score || ci(a.t) - ci(b.t) || a.t.localeCompare(b.t));
    const vis = out.filter((o) => !st.owned.has(o.t));
    const must = vis.filter((o) => o.tier === 1), rest = vis.filter((o) => o.tier !== 1);
    const n = Math.max(0, 6 - must.length);
    return { top: must.concat(rest.slice(0, n)), more: rest.slice(n), check: check.filter((c) => !st.owned.has(c[0])) };
  }

  /* ---------- 6-3 유형 안 서비스 정렬 ---------- */
  function rng(seed) { let h = 2166136261; for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }
  function services(t, k) {
    const expand = (arr) => new Set(arr.flatMap((c) => ALIAS[c] || [c]));
    const want = expand(k.K06), neu = expand(k.K08), r = rng(company.id + t);
    const certs = new Set();
    if (t === 'T01') k.K08.forEach((c) => { if (R1[c]) k.K03.forEach((g) => { if (R1[c][g]) R1[c][g].split(',').forEach((n) => certs.add(n.trim().split(/[ (]/)[0])); }); });
    const list = [];
    D.services.forEach((s) => {
      if (s.t !== t) return;
      const ct = s.c.filter((x) => x !== '국제 공통');
      if (ct.includes('국내') && !['내수기업', '수출초보'].includes(k.K01)) return;
      if (ct.length && !ct.includes('국내') && !ct.some((x) => want.has(x))) return;
      if (ITEM_FILTER.has(t) && s.i.length && !s.i.some((x) => k.K03.includes(x))) return;
      if (t === 'T08' && st.Q2 === 'B2B' && s.cons) return;
      const rank = ct.some((x) => neu.has(x)) ? 1 : ct.some((x) => want.has(x)) ? 2 : 3;
      const cm = [...certs].some((n) => s.n.toUpperCase().includes(n.toUpperCase())) ? 0 : 1;
      const im = ITEM_FILTER.has(t) && s.i.some((x) => k.K03.includes(x)) ? 0 : 1;
      list.push({ s, rank, cm, im, r: r() });
    });
    list.sort((a, b) => a.rank - b.rank || a.cm - b.cm || a.im - b.im || a.r - b.r);
    return list;
  }

  /* ======================================================================
     화면 (표시 방식만 다룸. 위의 keys, recommend, services 계산은 그대로 사용)
     ====================================================================== */
  const ui = { eval: false, saved: new Map(), qOpen: false, firstPaint: true, detail: null };
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const P = {
    shield: '<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.6.8 2.7 2.6 3 5.2"/>',
    booth: '<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v1.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0V9z"/><path d="M5 13v8h14v-8"/><path d="M10 21v-5h4v5"/>',
    megaphone: '<path d="M3.5 10v4h3l8.5 5V5L6.5 10z"/><path d="M18.5 8.5a5 5 0 0 1 0 7"/><path d="M7 14l1.5 5.5h2.5L10 15"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10.5l5-3v9l-5-3"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
    book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M9 7h6M9 10.5h4"/>',
    box: '<path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9"/>',
    pen: '<path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/><path d="M14 6l3 3"/>',
    tag: '<path d="M3 12V4h8l9.5 9.5-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    cap: '<path d="M2.5 9L12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v4.5c1.5 1.6 3.5 2.5 5.5 2.5s4-.9 5.5-2.5V11"/><path d="M21.5 9v5"/>',
    truck: '<path d="M2.5 6h11v10h-11z"/><path d="M13.5 9.5h4l3 3.5V16h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4"/><path d="M9 12l2 2 4-4"/>',
    doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 15.5h6M9 8.5h2"/>',
    building: '<path d="M4 21V5l8-2v18"/><path d="M12 8h8v13"/><path d="M2.5 21h19"/><path d="M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2"/>',
    alert: '<path d="M12 3.5L21.5 20h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.4"/>',
    chevron: '<path d="M9 5l7 7-7 7"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    bookmark: '<path d="M6.5 3.5h11v17L12 16.5l-5.5 4z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="10" r="2.3"/>',
    flag: '<path d="M5 21V4M5 4h11l-1.5 3.5L16 11H5"/>',
    percent: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.3"/><circle cx="17" cy="17" r="2.3"/>',
    star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
    reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>',
  };
  const icon = (n, cls) => `<svg class="ico${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || P.info}</svg>`;
  const TYPE_ICON = { T01: 'shield', T02: 'shield', T03: 'bulb', T04: 'bulb', T05: 'search', T06: 'users', T07: 'booth', T08: 'megaphone',
    T09: 'video', T10: 'globe', T11: 'book', T12: 'box', T13: 'pen', T14: 'tag', T15: 'chat', T16: 'cap', T17: 'truck', T18: 'clipboard',
    T19: 'doc', T20: 'building', T21: 'alert', T00: 'info' };

  // 기획 주석: 번호와 근거 섹션
  const ANNO = {
    hero: [1, '6-3 5번 노출 규칙. 필수 등급은 모두, 나머지는 점수 순으로 최대 6개'],
    ladder: [2, '6-2 K01 성장단계(시스템 부여값), 6-3 3번 단계 핵심 유형'],
    profile: [3, '6-2 1번 기업 키, 4장 키 우선순위(시스템 연계값이 신청서보다 우선)'],
    country: [4, '6-2 K06 진출희망국, K08 신규 진출국 = 진출희망국 − 현재 수출국'],
    questions: [5, '6-2 3번 신청서로 얻을 수 없는 키. 추천된 유형에 한해 최대 3문항'],
    alert: [6, '4장 판단 불가 처리, 6-2 K03 품목 출처 충돌'],
    tier: [7, '6-3 2번 등급'],
    score: [8, '6-3 4번 가산점(합계 최대 9점)'],
    basis: [9, '6-5 D1 이유 문장은 판정에 쓴 근거 키만 사용'],
    services: [10, '6-3 6번 유형 안 서비스 정렬'],
    program: [11, '6-2 프로그램 축 노출 조건, Q6 이용 자격'],
    own: [12, '6-2 3번 Q1, Q5 보유 확인'],
    check: [13, '6-3 1번 처리 순서 2단계. 키가 비면 확인필요'],
    more: [14, '6-3 5번 노출 규칙. 6개를 넘는 후보'],
    guide: [15, '4장 추천 공정성. 특정 기관 우대 없음, 가격 미반영'],
  };
  const anno = (k, cls) => `<span class="anno ${cls || 'pin'}" tabindex="0" data-tip="${esc(ANNO[k][1])}" aria-label="기획 주석 ${ANNO[k][0]}. ${esc(ANNO[k][1])}">${ANNO[k][0]}</span>`;
  const srcTip = (t) => `<button type="button" class="tip" data-tip="${esc(t)}" aria-label="출처: ${esc(t)}">${icon('info')}</button>`;
  const srcBadge = (t) => `<span class="src eval-only">${esc(t)}</span>`;

  // 사용자 화면에서는 근거 칩과 안내 문장의 신청서 항목 번호를 숨김
  const BASIS_USER = { '품목군 HS, 18, 6': '품목군', '신규 진출국 20 − 19': '신규 진출국', '계획 품목 18 − 현재 품목 17': '신규 품목',
    '국가별 인증표(가정)': '국가별 인증 기준', 'FTA 체결국(가정)': 'FTA 체결국' };
  const basisLabel = (b) => (ui.eval ? b : (BASIS_USER[b] || b.replace(/ 시스템$/, '').replace(/ [\d, −]+$/, '')));
  const cleanMsg = (m) => (ui.eval ? m : m.replace(/\((신청서 )?\d+번\)/g, ''));
  const ownAsk = (t) => (ui.eval ? OWN_ASK[t] : OWN_ASK[t].replace(/ \(실제 서비스는[^)]*\)/, ''));
  const price = (s) => (s.price ? `${fmt(s.price)}만원` : '가격 문의');

  function companyTitle(c) { return `(주)${c.id}`; }

  /* ---------- 왼쪽: 회사 프로필 ---------- */
  function renderProfile(k) {
    const c = company;
    const fact = (ic, label, val, src, srcNo) => `<li class="fact"><span class="fact-ico">${icon(ic)}</span><div><div class="fact-label">${label}${srcTip(src)}${srcBadge(srcNo)}</div>${val}</div></li>`;
    const countries = `<div class="fact-value">${k.K06.length ? '' : '입력되지 않음'}</div>
      <div class="chips" style="position:relative">${k.K06.map((x) => `<span class="chip${k.K08.includes(x) ? ' accent' : ''}">${esc(x)}${k.K08.includes(x) ? ' 신규' : ''}<button type="button" class="x" data-rm="${esc(x)}" aria-label="${esc(x)} 삭제">${icon('x')}</button></span>`).join('')}${anno('country', 'inline')}</div>
      <div class="add-row"><select id="addCountry" aria-label="추가할 진출희망국">${D.countries.filter((x) => !k.K06.includes(x)).map((x) => `<option>${esc(x)}</option>`).join('')}</select><button type="button" class="btn sm" data-act="add-country">추가</button></div>`;
    $('#profile').innerHTML = `
      ${anno('profile')}
      <div class="p-head">
        <span class="avatar" aria-hidden="true">CO</span>
        <div>
          <div class="p-name">${esc(c.id)} <span class="tier t2">${esc(c.stage)}</span></div>
          <div class="p-sub"><span>${esc(c.ind)}${srcTip('신청서 4번')}${srcBadge('4')}</span><span>${esc(c.region)}${srcTip('신청서 7번')}${srcBadge('7')}</span></div>
        </div>
      </div>
      <ul class="facts">
        ${fact('box', '주력 품목', `<div class="fact-value">${esc(c.item)}${c.conflict ? ' <span class="chip warn">통관 기록과 다름</span>' : ''}</div>`, '신청서 6번', '6')}
        ${fact('globe', '현재 수출국', `<div class="fact-value">${esc(c.K07.join(', ') || '없음')}</div>`, '관세청 연계', '시스템')}
        ${fact('flag', '진출희망국', countries, '신청서 20번', '20')}
        ${fact('percent', '직수출 비율', `<div class="fact-value">${c.direct == null ? '수출 실적 없음' : c.direct + '%'}</div>`, '신청서 10, 11번에서 계산', '10, 11')}
      </ul>
      <details class="p-more">
        <summary>${icon('chevron', 'sm')}자세히 보기</summary>
        <dl class="kv">
          <dt>HS코드</dt><dd>${c.hs ? esc(c.hs) : '없음'}${srcTip('관세청 연계')}${srcBadge('시스템')}</dd>
          <dt>수출액</dt><dd>${fmt(c.expPrev)} → ${fmt(c.expCur)}천 달러${srcTip('신청서 10, 11번')}${srcBadge('10, 11')}</dd>
          <dt>계획 품목</dt><dd>${esc(c.plan || '공란')}${srcTip('신청서 18번')}${srcBadge('18')}</dd>
          <dt>현지법인</dt><dd>${c.K15 ? '있음' : '없음'}${srcTip('자료 D (신청서, 사업계획서)')}${srcBadge('D')}</dd>
          <dt>품목군</dt><dd>${esc(k.K03.join(', '))}${srcTip('HS코드, 신청서 18, 6번으로 정규화')}${srcBadge('파생')}</dd>
        </dl>
      </details>`;
  }

  /* ---------- 왼쪽: 확인 질문 ---------- */
  function choice(key, cur, v, label) {
    const on = String(cur) === String(v);
    return `<button type="button" class="choice" data-seg="${key}" data-v="${v}" aria-pressed="${on}">${on ? icon('check') : ''}${esc(label)}</button>`;
  }
  function renderQuestions(k) {
    const c = company, qs = [];
    if (c.conflict) qs.push({ done: st.item !== 'both', html: `<div class="q"><div class="q-title">주력 품목은 무엇인가요?</div><div class="q-hint">통관 기록과 신청서 품목이 달라요</div><div class="choices">${choice('item', st.item, 'hs', `${c.hsCat} (통관 기록)`)}${choice('item', st.item, 'prod', `${c.prodCat.join(', ')} (신청서)`)}${choice('item', st.item, 'both', '둘 다')}</div></div>` });
    if (company.K04 === '실물' || k.K01 !== '내수기업') qs.push({ done: st.Q2 !== null, html: `<div class="q"><div class="q-title">주로 누구에게 판매하나요?</div><div class="choices">${choice('Q2', st.Q2, 'B2B', '기업 고객')}${choice('Q2', st.Q2, 'B2C', '소비자')}</div></div>` });
    qs.push({ done: st.Q4 !== null, html: `<div class="q"><div class="q-title">온라인으로 판매하나요?</div><div class="choices">${choice('Q4', st.Q4, 'true', '판매하고 있어요')}${choice('Q4', st.Q4, 'false', '판매하지 않아요')}</div></div>` });
    const done = qs.filter((q) => q.done).length, all = done === qs.length;
    const head = `${anno('questions')}<h2 id="qTitle">2가지만 답하면 더 정확해져요</h2>
      <div class="q-progress"><div class="bar"><span style="width:${qs.length ? (done / qs.length) * 100 : 0}%"></span></div><span>${done}/${qs.length} 답함</span></div>`;
    $('#questions').innerHTML = all && !ui.qOpen
      ? `${head}<div class="q-done">${icon('check')}확인 완료<button type="button" class="link" data-act="q-edit">답변 수정</button></div>`
      : head + qs.map((q) => q.html).join('');
  }

  /* ---------- 오른쪽: 추천 카드 ---------- */
  function svcCard(x, t, first) {
    const s = x.s, saved = ui.saved.has(s.id);
    const chips = [];
    if (x.rank === 1) chips.push('<span class="chip accent">신규 진출국 일치</span>');
    else if (x.rank === 2) chips.push('<span class="chip accent">진출희망국 일치</span>');
    if (x.cm === 0) chips.push('<span class="chip accent">필요 인증 일치</span>');
    const prog = s.p !== '일반' && !(s.p === '관세대응' && st.K16.has('관세대응'));
    if (prog) chips.push(`<span class="chip caution">${esc(s.p)}, 자격 확인 필요</span>${first.prog ? '' : anno('program', 'inline')}`);
    if (prog) first.prog = true;
    return `<div class="svc-card">
      <button type="button" class="svc-open" data-detail="${esc(s.id)}" data-type="${t}">
        <span class="svc-band">${icon(TYPE_ICON[t])}${esc(T[t].name)}<span class="code eval-only">${esc(s.id)}</span></span>
        <span class="svc-name">${esc(s.n)}</span>
        <span class="svc-chips">${chips.join('')}</span>
        <span class="svc-price${s.price ? '' : ' none'}">${price(s)}</span>
      </button>
      <button type="button" class="save" data-save="${esc(s.id)}" data-type="${t}" aria-pressed="${saved}" aria-label="${saved ? '담기 취소' : '담기'}: ${esc(s.n)}">${icon('bookmark')}</button>
    </div>`;
  }

  function renderRecs(res, k, changed) {
    const before = {};
    if (changed && !reduce) document.querySelectorAll('.rec[data-t]').forEach((el) => { before[el.dataset.t] = el.getBoundingClientRect().top; });
    const newRank = {}, first = { prog: false, own: false };
    $('#recs').innerHTML = res.top.map((o, i) => {
      newRank[o.t] = i + 1;
      let move = '';
      if (prevRank && changed) {
        if (prevRank[o.t] == null) move = '<span class="move new">새로 추천</span>';
        else if (prevRank[o.t] > i + 1) move = `<span class="move up">▲ ${prevRank[o.t] - (i + 1)}</span>`;
        else if (prevRank[o.t] < i + 1) move = `<span class="move down">▼ ${i + 1 - prevRank[o.t]}</span>`;
      }
      const sv = services(o.t, k), open = st.expanded.has(o.t), shown = open ? sv : sv.slice(0, 3);
      const sOpen = openScore.has(o.t);
      const tierLabel = o.tier === 1 ? '필수 등급' : o.tier === 2 ? `단계 핵심 (${company.stage})` : '실무 지원 등급';
      const ask = OWN_ASK[o.t] ? ownAsk(o.t) : (o.t === 'T08' && st.Q2 === null ? '판매 대상을 알려주시면 소비자 대상 채널을 거를 수 있어요' : '');
      const ownBtn = OWN_ASK[o.t] ? `<button type="button" class="btn sm" data-own="${o.t}">${icon('check', 'sm')}보유 중</button>` : `<button type="button" class="btn sm" data-act="go-q">답하기</button>`;
      const firstOwn = OWN_ASK[o.t] && !first.own; if (firstOwn) first.own = true;
      return `<article class="card rec t${o.tier}" data-t="${o.t}" aria-labelledby="h-${o.t}">
        <div class="rec-head">
          <span class="type-ico">${icon(TYPE_ICON[o.t])}<span class="rank" aria-label="${i + 1}순위">${i + 1}</span></span>
          <div class="rec-title">
            ${o.tier === 1 ? `<span class="must-label">${icon('star')}꼭 필요해요</span>` : ''}
            <h3 id="h-${o.t}">${esc(T[o.t].name)}</h3>
            <span class="code eval-only">${o.t}</span>
            <span class="tier t${o.tier}">${TIER_NAME[o.tier]}</span>${i === 0 ? anno('tier', 'inline') : ''}${move}
          </div>
          <button type="button" class="score-btn eval-only" data-score="${o.t}" aria-expanded="${sOpen}" aria-controls="bd-${o.t}"><b>${o.score}</b>점, 근거 보기${i === 0 ? anno('score', 'inline') : ''}</button>
        </div>
        <div class="rec-body">
          <p class="why">${esc(o.why)}</p>
          <div class="basis">${o.basis.map((b) => `<span class="chip">${esc(basisLabel(b))}</span>`).join('')}${i === 0 ? anno('basis', 'inline') : ''}</div>
          <div class="breakdown eval-only" id="bd-${o.t}"${sOpen ? '' : ' hidden'}><span>${tierLabel} 기본점</span><span>${TIER_BASE[o.tier]}</span>${o.bonus.map((b) => `<span>${esc(b[1])}</span><span>+${b[0]}</span>`).join('')}<span class="total">합계</span><span class="total">${o.score}</span></div>
          <div class="svc-grid" style="position:relative">${sv.length ? shown.map((x) => svcCard(x, o.t, first)).join('') : '<p class="q-hint">조건에 맞는 메뉴판 서비스가 아직 없어요</p>'}${i === 0 ? anno('services') : ''}</div>
          <div class="rec-foot">
            <span class="meta">메뉴판에서 조건에 맞는 서비스 ${sv.length}건</span>
            ${sv.length > 3 ? `<button type="button" class="link" data-exp="${o.t}">${open ? '접기' : `전체 ${sv.length}건 보기`}${icon(open ? 'chevron' : 'arrow', 'sm')}</button>` : ''}
          </div>
        </div>
        ${ask ? `<div class="own-bar"><span>${esc(ask)}</span>${ownBtn}${firstOwn ? anno('own') : ''}</div>` : ''}
      </article>`;
    }).join('') || '<p class="q-hint">추천할 유형이 없어요</p>';
    prevRank = newRank;

    // 순서 이동 애니메이션(200ms)과 처음 등장
    const cards = document.querySelectorAll('.rec[data-t]');
    if (ui.firstPaint && !reduce) cards.forEach((el, i) => { el.classList.add('enter'); el.style.animationDelay = `${i * 70}ms`; });
    if (changed && !reduce) {
      cards.forEach((el) => {
        const t = el.dataset.t, top = el.getBoundingClientRect().top;
        if (before[t] == null) { el.classList.add('enter'); return; }
        const dy = before[t] - top;
        if (!dy) return;
        el.style.transition = 'none'; el.style.transform = `translateY(${dy}px)`;
        requestAnimationFrame(() => { el.style.transition = 'transform .2s ease-out'; el.style.transform = ''; });
        el.addEventListener('transitionend', () => { el.style.transition = ''; }, { once: true });
      });
    }
  }

  function renderRest(res) {
    const c = company;
    $('#checkHint').textContent = `${res.check.length}개`;
    $('#checkSec').hidden = res.check.length === 0;
    $('#checks').innerHTML = res.check.map((x, i) => `<div class="check-card" style="position:relative">
        ${i === 0 ? anno('check') : ''}
        <h3>${icon(TYPE_ICON[x[0]])}${esc(T[x[0]].name)}<span class="code eval-only">${x[0]}</span></h3>
        <p>${esc(cleanMsg(x[1]))}</p>
        <button type="button" class="btn sm" data-fill="${x[0]}">정보 입력하기</button>
      </div>`).join('');
    $('#moreHint').textContent = res.more.length ? `${res.more.length}개` : '없음';
    $('#more').innerHTML = (res.more.length ? res.more.map((o) => `<div class="card mini">
        <div class="mini-head"><span class="type-ico">${icon(TYPE_ICON[o.t])}</span><h3>${esc(T[o.t].name)}</h3><span class="tier t${o.tier}">${TIER_NAME[o.tier]}</span><span class="code eval-only">${o.score}점</span></div>
        <p>${esc(o.why)}</p>
      </div>`).join('') : '<p class="q-hint">추천 6개 밖으로 밀린 유형이 없어요</p>');
    if (!document.querySelector('#moreSec .anno')) $('#moreSec summary').insertAdjacentHTML('beforeend', anno('more', 'inline'));
    $('#hiddenSec').hidden = st.owned.size === 0;
    $('#hiddenTypes').innerHTML = [...st.owned].map((t) => `<span class="chip">${esc(T[t].name)}<button type="button" class="x" data-unown="${t}" aria-label="${esc(T[t].name)} 다시 추천에 넣기">↺</button></span>`).join('');

    // 알림
    let al = '';
    if (!st.K06.length) al += `<div class="alert">${icon('alert')}<div><strong>진출희망국을 알려주세요</strong><p>진출희망국이 비어 있어 인증, 전시회, 통번역처럼 국가가 필요한 서비스는 추천하지 않았어요. 회사 프로필에서 국가를 추가하면 바로 반영돼요.</p></div>${anno('alert')}</div>`;
    if (c.conflict && st.item === 'both') al += `<div class="alert">${icon('alert')}<div><strong>주력 품목을 확인해 주세요</strong><p>통관 기록(${ui.eval ? 'HS ' + esc(c.hs) + ', ' : ''}${esc(c.hsCat)})과 신청서 생산품목(${esc(c.item)})이 달라요. 지금은 두 품목군을 모두 기준으로 추천했어요.</p></div>${al ? '' : anno('alert')}</div>`;
    $('#alerts').innerHTML = al;
  }

  function renderHero(res) {
    const c = company, idx = STAGES.indexOf(c.stage);
    $('#heroTitle').innerHTML = `담당자님 회사에 맞는 서비스 유형 <em>${res.top.length}개</em>를 찾았어요${anno('hero', 'inline')}`;
    $('#counts').innerHTML = `<div class="count must"><b>${res.top.filter((o) => o.tier === 1).length}</b><span>필수</span></div>
      <div class="count"><b>${res.top.length}</b><span>추천</span></div>
      <div class="count warn"><b>${res.check.length}</b><span>확인 필요</span></div>`;
    $('#ladder').innerHTML = STAGES.map((s, i) => `<li class="${i < idx ? 'past' : i === idx ? 'now' : ''}">${s}${i === idx ? ' (현재)' : ''}</li>`).join('') + anno('ladder');
    $('#navWho').textContent = `${companyTitle(c)} 담당자님`;
  }

  function renderFooter() {
    $('#logicFooter').innerHTML = `
      <p><strong>추천 순서 (6-3)</strong>필수(누락하면 수출이 막힘), 단계 핵심(현재 성장단계에서 다음 단계에 필요), 실무 지원 순. 같은 등급 안에서는 신호마다 가산점을 더하고 합계는 최대 9점.</p>
      <p><strong>서비스 정렬 (6-3 6번)</strong>신규 진출국 일치, 진출희망국 일치, 국가 무관 순. 같은 순위에서는 필요 인증명과 품목이 맞는 서비스를 먼저, 그 안에서는 무작위. 가격은 순위에 반영하지 않음.</p>
      <p><strong>데이터</strong>기업은 과제 자료 D의 가상 기업 60개, 서비스는 메뉴판 샘플 300건. 국가별 인증표와 FTA 체결국은 기획안에 적은 가정.</p>${anno('guide')}`;
  }

  function render(changed) {
    const k = keys(), res = recommend(k);
    renderHero(res); renderProfile(k); renderQuestions(k); renderRecs(res, k, changed); renderRest(res); renderFooter();
    ui.firstPaint = false;
    if (ui.detail) openDetail(ui.detail.id, ui.detail.t, true);
  }

  /* ---------- 담기, 하단 바 ---------- */
  function renderCart() {
    const n = ui.saved.size, cart = $('#cart');
    document.body.classList.toggle('has-cart', n > 0);
    cart.classList.toggle('show', n > 0);
    $('#cartTitle').textContent = `담은 서비스 ${n}건`;
    $('#cartItems').innerHTML = [...ui.saved.values()].map((v) => `<span class="chip">${icon(TYPE_ICON[v.t], 'sm')}<span>${esc(v.s.n)}</span><button type="button" class="x" data-save="${esc(v.s.id)}" data-type="${v.t}" aria-label="담기 취소: ${esc(v.s.n)}">${icon('x')}</button></span>`).join('');
  }
  function toggleSave(id, t) {
    if (ui.saved.has(id)) { ui.saved.delete(id); toast('담기를 취소했어요'); }
    else { const s = D.services.find((x) => x.id === id); ui.saved.set(id, { s, t }); toast('서비스를 담았어요'); }
    document.querySelectorAll(`.save[data-save="${CSS.escape(id)}"]`).forEach((b) => { const on = ui.saved.has(id); b.setAttribute('aria-pressed', String(on)); });
    renderCart();
    if (ui.detail) openDetail(ui.detail.id, ui.detail.t, true);
  }

  /* ---------- 드로어, 모달 ---------- */
  let lastFocus = null;
  function openLayer(el) {
    lastFocus = document.activeElement;
    closeLayers(true);
    const scrim = $('#scrim'); scrim.hidden = false; el.hidden = false;
    requestAnimationFrame(() => { scrim.classList.add('show'); el.classList.add('show'); });
    document.body.classList.add('lock');
    const f = el.querySelector('button, select, input'); if (f) setTimeout(() => f.focus(), 50);
  }
  function closeLayers(silent) {
    ['#demoDrawer', '#detailDrawer', '#guideModal'].forEach((s) => { const el = $(s); el.classList.remove('show'); if (!el.hidden) setTimeout(() => { if (!el.classList.contains('show')) el.hidden = true; }, reduce ? 0 : 200); });
    const scrim = $('#scrim'); scrim.classList.remove('show'); setTimeout(() => { if (!scrim.classList.contains('show')) scrim.hidden = true; }, reduce ? 0 : 200);
    document.body.classList.remove('lock');
    if (!silent) { ui.detail = null; if (lastFocus) lastFocus.focus(); }
  }

  function openDemo(focusId) {
    const k = keys();
    const seg = (key, cur, opts) => `<div class="choices">${opts.map((o) => choice(key, cur, o[0], o[1])).join('')}</div>`;
    $('#demoBody').innerHTML = `
      <div class="demo-note">${icon('info', 'sm')}평가용 시연 도구입니다. 실제 서비스에는 없습니다</div>
      <div class="demo-group">
        <h3>기획안 적용 사례</h3>
        <div class="case-list">${CASES.map((c) => `<button type="button" class="case-btn" data-case="${c.id}" aria-pressed="${c.id === company.id}">${esc(c.label)}${c.id === company.id ? icon('check') : ''}</button>`).join('')}</div>
        <div class="field"><label for="company">전체 60개 기업</label><select id="company">${D.companies.map((c) => `<option value="${c.id}"${c.id === company.id ? ' selected' : ''}>${c.id}, ${esc(c.stage)}, ${esc(c.item)}</option>`).join('')}</select></div>
      </div>
      <div class="demo-group">
        <h3>신청서 항목이지만 과제 자료 D에 없는 값</h3>
        <div class="field" id="f-K14"><span class="lab">외국어 홈페이지<span class="src">22</span></span>${seg('K14', st.K14, [['true', '있음'], ['false', '없음']])}</div>
        <div class="field" id="f-K13"><span class="lab">연구개발 인력<span class="src">16</span></span>${seg('K13', st.K13, [['true', '1명 이상'], ['false', '없음']])}</div>
        <div class="field"><label for="K12">해외마케팅 인력(명)<span class="src">15</span></label><input id="K12" type="number" min="0" inputmode="numeric" placeholder="미입력" value="${st.K12 == null ? '' : st.K12}"></div>
        <div class="field"><label for="K11">수출업력(년)<span class="src">13</span></label><input id="K11" type="number" min="0" inputmode="numeric" placeholder="미입력" value="${st.K11 == null ? '' : st.K11}"></div>
        <div class="field"><span class="lab">한도확대 희망<span class="src">23</span></span><div class="checks">${['국제운송', '관세대응'].map((x) => `<label><input type="checkbox" data-k16="${x}"${st.K16.has(x) ? ' checked' : ''}> ${x}</label>`).join('')}</div></div>
      </div>
      <button type="button" class="btn" data-act="reset">${icon('reset', 'sm')}이 기업을 신청서 값으로 되돌리기</button>`;
    const drawer = $('#demoDrawer');
    if (drawer.hidden) openLayer(drawer);
    if (focusId) setTimeout(() => { const el = document.getElementById(focusId); if (el) { el.scrollIntoView({ block: 'center' }); const b = el.matches('input') ? el : el.querySelector('button, input'); if (b) b.focus(); } }, 120);
  }

  function openDetail(id, t, refresh) {
    const s = D.services.find((x) => x.id === id); if (!s) return;
    ui.detail = { id, t };
    const k = keys();
    const match = services(t, k).find((x) => x.s.id === id);
    const chips = [];
    if (match && match.rank === 1) chips.push('<span class="chip accent">신규 진출국 일치</span>');
    else if (match && match.rank === 2) chips.push('<span class="chip accent">진출희망국 일치</span>');
    if (match && match.cm === 0) chips.push('<span class="chip accent">필요 인증 일치</span>');
    if (s.p !== '일반' && !(s.p === '관세대응' && st.K16.has('관세대응'))) chips.push(`<span class="chip caution">${esc(s.p)}, 자격 확인 필요</span>`);
    const saved = ui.saved.has(id);
    $('#detailBody').innerHTML = `
      <div class="svc-band">${icon(TYPE_ICON[t])}${esc(T[t].name)}<span class="code eval-only">${esc(s.id)}</span></div>
      <h3 class="detail-name">${esc(s.n)}</h3>
      <div class="svc-chips">${chips.join('')}</div>
      <div class="detail-price">${price(s)}</div>
      <dl class="kv">
        <dt>메뉴판 분류</dt><dd>${esc(s.off)}</dd>
        <dt>대상 국가</dt><dd>${s.c.length ? esc(s.c.join(', ')) : '표시 없음'}</dd>
        <dt>대상 품목</dt><dd>${s.i.length ? esc(s.i.join(', ')) : '표시 없음'}</dd>
        <dt>이용 자격</dt><dd>${s.p === '일반' ? '모든 선정 기업' : esc(s.p) + ' 대상 기업'}</dd>
      </dl>
      <p class="detail-note">광고 문구와 소개글은 이 목업의 데이터 파일에 들어 있지 않아 표시하지 않습니다. 실제 서비스에서는 수행기관이 메뉴판에 등록한 원문을 그대로 보여줍니다.</p>`;
    $('#detailFoot').innerHTML = `<button type="button" class="btn${saved ? '' : ' primary'}" data-save="${esc(id)}" data-type="${t}">${icon('bookmark', 'sm')}${saved ? '담기 취소' : '담기'}</button>`;
    if (!refresh) openLayer($('#detailDrawer'));
  }

  function openGuide() {
    $('#guideBody').innerHTML = `
      <li><span class="type-ico">${icon('star')}</span><div><h3>추천 순서</h3><p>꼭 필요해요(진출국에서 반드시 필요한 인증), 지금 단계에 필요해요(현재 성장단계에서 다음 단계로 가는 데 필요한 서비스), 함께 보면 좋아요 순으로 보여드려요. 같은 단계 안에서는 신청서에 적어주신 정보가 많이 맞을수록 위에 와요.</p></div></li>
      <li><span class="type-ico">${icon('search')}</span><div><h3>서비스 정렬</h3><p>새로 진출하는 나라에 맞는 서비스, 진출희망국에 맞는 서비스, 나라와 관계없는 서비스 순서예요. 같은 순서 안에서는 필요한 인증과 품목이 맞는 서비스를 먼저 보여드려요.</p></div></li>
      <li><span class="type-ico">${icon('shield')}</span><div><h3>공정성</h3><p>특정 수행기관을 우대하지 않아요. 순서가 같은 서비스는 무작위로 보여드리고, 가격은 순서에 반영하지 않아요.</p></div></li>`;
    openLayer($('#guideModal'));
  }

  /* ---------- 공통 ---------- */
  let toastTimer;
  function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1800); }
  function update(msg) { render(true); if (!$('#demoDrawer').hidden) openDemo(); toast(msg || '추천을 다시 계산했어요'); }

  function load(id, fromDemo) {
    company = D.companies.find((c) => c.id === id) || D.companies[0];
    st = fresh(company); prevRank = null; openScore = new Set(); ui.saved = new Map(); ui.qOpen = false; ui.detail = null;
    renderCart();
    try { history.replaceState(null, '', '#' + company.id); } catch (e) { /* 미리보기 등에서 막힐 수 있음 */ }
    render(false);
    if (fromDemo) { openDemo(); toast(`${company.id} 기업으로 바꿨어요`); }
  }

  function setEval(on) {
    ui.eval = on;
    document.body.classList.toggle('eval', on);
    $('#evalToggle').setAttribute('aria-checked', String(on));
    render(false);
    toast(on ? '평가자 보기를 켰어요. 보라색 번호에 마우스를 올리면 기획 근거가 보여요' : '평가자 보기를 껐어요');
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (a) {
      const act = a.dataset.act;
      if (a.tagName === 'A') e.preventDefault();
      if (act === 'menu-soon') toast('목업에서는 준비 중이에요');
      else if (act === 'menu-active' || act === 'home') window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      else if (act === 'noop') toast('목업에서는 동작하지 않아요');
      else if (act === 'guide') openGuide();
      else if (act === 'demo') openDemo();
      else if (act === 'close') closeLayers();
      else if (act === 'reset') { load(company.id); openDemo(); toast('신청서 값으로 되돌렸어요'); }
      else if (act === 'add-country') { const v = $('#addCountry').value; if (v && !st.K06.includes(v)) { st.K06.push(v); update(`${v}를 추가해 다시 계산했어요`); } }
      else if (act === 'q-edit') { ui.qOpen = true; render(false); }
      else if (act === 'go-q') { const q = $('#questions'); q.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); ui.qOpen = true; render(false); }
      return;
    }
    if (e.target.id === 'scrim') { closeLayers(); return; }
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (b.id === 'evalToggle') setEval(!ui.eval);
    else if (d.case) load(d.case, true);
    else if (d.rm) { st.K06 = st.K06.filter((x) => x !== d.rm); update(`${d.rm}를 빼고 다시 계산했어요`); }
    else if (d.seg) {
      const raw = d.v, v = raw === 'true' ? true : raw === 'false' ? false : raw;
      if (d.seg === 'item') st.item = v; else st[d.seg] = st[d.seg] === v ? null : v;
      update();
    }
    else if (d.own) { st.owned.add(d.own); update(`${T[d.own].name}을(를) 보유 중으로 표시했어요`); }
    else if (d.unown) { st.owned.delete(d.unown); update(); }
    else if (d.exp) { st.expanded.has(d.exp) ? st.expanded.delete(d.exp) : st.expanded.add(d.exp); render(false); }
    else if (d.score) { openScore.has(d.score) ? openScore.delete(d.score) : openScore.add(d.score); render(false); }
    else if (d.save) toggleSave(d.save, d.type);
    else if (d.detail) openDetail(d.detail, d.type);
    else if (d.fill) {
      const t = d.fill;
      if (t === 'T01' && !st.K06.length) { const sel = $('#addCountry'); sel.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); sel.focus(); }
      else if (t === 'T12') { ui.qOpen = true; render(false); $('#questions').scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); }
      else openDemo(t === 'T10' ? 'f-K14' : t === 'T04' ? 'f-K13' : t === 'T16' ? 'K12' : null);
    }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'company') load(el.value, true);
    else if (el.id === 'K11' || el.id === 'K12') { st[el.id] = el.value === '' ? null : Math.max(0, parseInt(el.value, 10) || 0); update(); }
    else if (el.dataset && el.dataset.k16) { el.checked ? st.K16.add(el.dataset.k16) : st.K16.delete(el.dataset.k16); update(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLayers(); });

  // 처음 열 때 0.6초 스켈레톤
  const start = (location.hash || '').replace('#', '').toUpperCase();
  const startId = D.companies.some((c) => c.id === start) ? start : 'CO-056';
  if (reduce) load(startId);
  else {
    company = D.companies.find((c) => c.id === startId); st = fresh(company);
    $('#recs').innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
    $('#heroTitle').textContent = '담당자님 회사에 맞는 서비스를 찾고 있어요';
    setTimeout(() => load(startId), 600);
  }
})();
