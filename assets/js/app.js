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

  /* ---------- 화면 ---------- */
  function seg(id, cur, opts) {
    return `<div class="seg" role="group" aria-label="${esc(id)}">${opts.map((o) => `<button type="button" data-seg="${id}" data-v="${o[0]}" aria-pressed="${String(cur) === String(o[0])}">${esc(o[1])}</button>`).join('')}</div>`;
  }

  function renderSide(k) {
    const c = company;
    const facts = [
      ['성장단계', `${esc(c.stage)}<span class="src">시스템</span>`],
      ['업종', `${esc(c.ind)}<span class="src">5</span>`],
      ['생산품목', `${esc(c.item)}<span class="src">6</span>`],
      ['계획 품목', `${esc(c.plan || '공란')}<span class="src">18</span>`],
      ['HS코드', `${c.hs ? esc(c.hs) : '없음'}<span class="src">시스템</span>`],
      ['품목군', `${esc(k.K03.join(', '))}${c.conflict ? '<span class="conflict">출처 충돌</span>' : ''}`],
      ['수출액', `${fmt(c.expPrev)} → ${fmt(c.expCur)}천 달러<span class="src">10, 11</span>`],
      ['직수출 비율', c.direct == null ? '-' : `${c.direct}%`],
      ['현재 수출국', `${esc(c.K07.join(', ') || '없음')}<span class="src">시스템</span>`],
      ['현지법인', c.K15 ? '있음' : '없음'],
    ];
    $('#facts').innerHTML = facts.map((f) => `<dt>${f[0]}</dt><dd>${f[1]}</dd>`).join('');
    $('#countries').innerHTML = k.K06.length
      ? k.K06.map((x) => `<span class="chip${k.K08.includes(x) ? ' new' : ''}">${esc(x)}${k.K08.includes(x) ? ' 신규' : ''}<button type="button" class="x" data-rm="${esc(x)}" aria-label="${esc(x)} 삭제">×</button></span>`).join('')
      : '<span class="empty">신청서에 입력되지 않았습니다.</span>';
    $('#addCountry').innerHTML = D.countries.filter((x) => !k.K06.includes(x)).map((x) => `<option>${esc(x)}</option>`).join('');

    // 확인 질문: 실제 서비스에서도 묻는 항목(기획안 6-2 Q2, Q4, 품목 확인)
    const qs = [];
    if (c.conflict) qs.push({ done: st.item !== 'both', html: `<div class="q"><div class="q-label">주력 품목은 무엇인가요? <span class="q-affects">제품 인증, 시스템 인증</span></div>${seg('item', st.item, [['hs', `${c.hsCat} (통관 기록)`], ['prod', `${c.prodCat.join(', ')} (신청서)`], ['both', '둘 다']])}</div>` });
    if (company.K04 === '실물' || k.K01 !== '내수기업') qs.push({ done: st.Q2 !== null, html: `<div class="q"><div class="q-label">주로 누구에게 판매하나요? <span class="q-affects">포장디자인, 온라인 마케팅</span></div>${seg('Q2', st.Q2, [['B2B', '기업 고객'], ['B2C', '소비자']])}</div>` });
    qs.push({ done: st.Q4 !== null, html: `<div class="q"><div class="q-label">온라인으로 판매하나요? <span class="q-affects">외국어 웹, 상세페이지</span></div>${seg('Q4', st.Q4, [['true', '예'], ['false', '아니오']])}</div>` });
    const done = qs.filter((q) => q.done).length;
    // 신청서에 있지만 자료 D에 없는 항목(기획안 4장 "조건부"). 시연용으로 직접 입력
    const demo = `
      <div class="q"><div class="q-label">외국어 홈페이지<span class="src">22</span></div>${seg('K14', st.K14, [['true', '있음'], ['false', '없음']])}</div>
      <div class="q"><div class="q-label">연구개발 인력<span class="src">16</span></div>${seg('K13', st.K13, [['true', '1명 이상'], ['false', '없음']])}</div>
      <div class="q"><label class="q-label" for="K12">해외마케팅 인력(명)<span class="src">15</span></label><input id="K12" type="number" min="0" inputmode="numeric" placeholder="미입력" value="${st.K12 == null ? '' : st.K12}"></div>
      <div class="q"><label class="q-label" for="K11">수출업력(년)<span class="src">13</span></label><input id="K11" type="number" min="0" inputmode="numeric" placeholder="미입력" value="${st.K11 == null ? '' : st.K11}"></div>
      <div class="q"><div class="q-label">한도확대 희망<span class="src">23</span></div><div class="checks">${['국제운송', '관세대응'].map((x) => `<label><input type="checkbox" id="k16-${x}" data-k16="${x}"${st.K16.has(x) ? ' checked' : ''}> ${x}</label>`).join('')}</div></div>`;
    $('#questions').innerHTML = `
      <div class="qgroup">
        <div class="panel-head"><span class="qgroup-title">확인 질문</span><span class="hint">${done} / ${qs.length} 답함</span></div>
        <div class="progress" aria-hidden="true"><span style="width:${qs.length ? (done / qs.length) * 100 : 0}%"></span></div>
        ${qs.map((q) => q.html).join('')}
      </div>
      <div class="qgroup">
        <span class="qgroup-title">신청서 항목이지만 과제 자료 D에 없는 값 (시연용 입력)</span>
        ${demo}
      </div>`;
  }

  function svcRow(x) {
    const s = x.s, tags = [];
    tags.push(x.rank === 1 ? '<span class="match">신규 진출국 일치</span>' : x.rank === 2 ? '<span class="match">진출희망국 일치</span>' : '국가 무관');
    if (x.cm === 0) tags.push('<span class="match">필요 인증과 일치</span>');
    if (s.c.length) tags.push(esc(s.c.join(', ')));
    if (s.i.length) tags.push(esc(s.i.join(', ')));
    const prog = s.p !== '일반' && !(s.p === '관세대응' && st.K16.has('관세대응')) ? `<span class="badge">${esc(s.p)}, 자격 확인 필요</span>` : '';
    return `<li><span class="sid">${esc(s.id)}</span><span class="sname">${esc(s.n)}${prog}<span class="stags">${tags.join(' / ')}</span></span><span class="price">${s.price ? fmt(s.price) + '만원' : '가격 미등록'}</span></li>`;
  }

  function render(changed) {
    const c = company, k = keys(), res = recommend(k);
    renderSide(k);

    const idx = STAGES.indexOf(c.stage);
    $('#summary').innerHTML = `
      <div><h2>${esc(c.id)} ${esc(c.item)}</h2><p class="sub">${esc(c.region)}, ${esc(c.ind)}. 신청서와 시스템 값으로 계산한 추천입니다</p></div>
      <div class="counts">
        <div class="count must"><b>${res.top.filter((o) => o.tier === 1).length}</b><span>필수</span></div>
        <div class="count"><b>${res.top.length}</b><span>추천 유형</span></div>
        <div class="count warn"><b>${res.check.length}</b><span>확인 필요</span></div>
      </div>
      <ol class="ladder" aria-label="성장단계">${STAGES.map((s, i) => `<li class="${i < idx ? 'past' : i === idx ? 'now' : ''}">${s}</li>`).join('')}</ol>`;

    let al = '';
    if (!k.K06.length) al += `<div class="alert" role="status"><span class="mark">!</span><div><strong>진출희망국을 알려주세요</strong><p>신청서 20번이 비어 있어 인증, 전시회, 통번역처럼 국가가 필요한 서비스는 추천하지 않았습니다. 왼쪽에서 국가를 추가하면 바로 반영됩니다.</p></div></div>`;
    if (c.conflict && st.item === 'both') al += `<div class="alert" role="status"><span class="mark">!</span><div><strong>주력 품목을 확인해 주세요</strong><p>통관 기록(HS ${esc(c.hs)}, ${esc(c.hsCat)})과 신청서 생산품목(${esc(c.item)})이 다릅니다. 지금은 두 품목군을 모두 기준으로 추천했습니다.</p></div></div>`;
    $('#alerts').innerHTML = al;

    const newRank = {};
    $('#cards').innerHTML = res.top.map((o, i) => {
      newRank[o.t] = i + 1;
      let move = '';
      if (prevRank && changed) {
        if (prevRank[o.t] == null) move = '<span class="move new">새로 추천</span>';
        else if (prevRank[o.t] > i + 1) move = `<span class="move up">▲ ${prevRank[o.t] - (i + 1)}</span>`;
        else if (prevRank[o.t] < i + 1) move = `<span class="move down">▼ ${i + 1 - prevRank[o.t]}</span>`;
      }
      const sv = services(o.t, k), open = st.expanded.has(o.t), shown = open ? sv : sv.slice(0, 3);
      const sOpen = openScore.has(o.t);
      const tierLabel = o.tier === 1 ? '필수 등급' : o.tier === 2 ? `단계 핵심 (${esc(company.stage)})` : '실무 지원 등급';
      const breakdown = `<div class="breakdown" id="bd-${o.t}"${sOpen ? '' : ' hidden'}><span>${tierLabel} 기본점</span><span>${TIER_BASE[o.tier]}</span>${o.bonus.map((b) => `<span>${esc(b[1])}</span><span>+${b[0]}</span>`).join('')}<span class="total">합계</span><span class="total">${o.score}</span></div>`;
      const ask = OWN_ASK[o.t] ? `<p class="ask">${esc(OWN_ASK[o.t])}</p>` : (o.t === 'T08' && st.Q2 === null ? '<p class="ask">판매 대상을 알려주면 소비자 대상 채널을 거를 수 있습니다.</p>' : '');
      return `<article class="card${o.tier === 1 ? ' tier1' : ''}${move ? ' flash' : ''}" aria-labelledby="h-${o.t}">
        <div class="rank">${i + 1}</div>
        <div class="card-body">
          <div class="card-head">
            <h3 id="h-${o.t}">${esc(T[o.t].name)}</h3><span class="code">${o.t}</span>
            <span class="pill t${o.tier}">${TIER_NAME[o.tier]}</span>${move}
            <button type="button" class="score-btn" data-score="${o.t}" aria-expanded="${sOpen}" aria-controls="bd-${o.t}"><b>${o.score}</b>점, 근거 보기</button>
          </div>
          <p class="why">${esc(o.why)}</p>
          <div class="basis">${o.basis.map((b) => `<span>${esc(b)}</span>`).join('')}</div>
          ${breakdown}
          ${ask}
          <div class="svc">
            <div class="svc-meta"><span>메뉴판 서비스 ${sv.length}건 중 ${shown.length}건</span><span>${esc(T[o.t].def)}</span></div>
            ${sv.length ? `<ol>${shown.map(svcRow).join('')}</ol>` : '<p class="empty">조건에 맞는 샘플 서비스가 없습니다.</p>'}
          </div>
          <div class="card-actions">
            ${sv.length > 3 ? `<button type="button" class="btn" data-exp="${o.t}">${open ? '접기' : `전체 ${sv.length}건 보기`}</button>` : ''}
            ${OWN_ASK[o.t] ? `<button type="button" class="btn ghost" data-own="${o.t}">이미 있음, 숨기기</button>` : ''}
          </div>
        </div>
      </article>`;
    }).join('') || '<p class="empty">추천할 유형이 없습니다.</p>';
    prevRank = newRank;

    $('#moreCount').textContent = `${res.more.length}개`;
    $('#more').innerHTML = res.more.length ? res.more.map((o) => `<div class="row-item"><strong>${esc(T[o.t].name)} <span class="pill t${o.tier}">${TIER_NAME[o.tier]}</span></strong><span class="reason">${esc(o.why)}</span><span class="hint">${o.score}점</span></div>`).join('') : '<p class="empty">추천 6개 밖으로 밀린 유형이 없습니다.</p>';
    $('#checkCount').textContent = `${res.check.length}개`;
    $('#check').innerHTML = res.check.length ? res.check.map((x) => `<div class="row-item"><strong>${esc(T[x[0]].name)}</strong><span class="reason">${esc(x[1])}</span><span></span></div>`).join('') : '<p class="empty">확인이 필요한 유형이 없습니다.</p>';
    $('#hiddenWrap').hidden = st.owned.size === 0;
    $('#hidden').innerHTML = [...st.owned].map((t) => `<span class="chip">${esc(T[t].name)}<button type="button" class="x" data-unown="${t}" aria-label="${esc(T[t].name)} 다시 보기">↺</button></span>`).join('');
  }

  let toastTimer;
  function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1800); }
  function update(msg) { render(true); toast(msg || '추천을 다시 계산했습니다'); }

  function load(id) {
    company = D.companies.find((c) => c.id === id) || D.companies[0];
    st = fresh(company); prevRank = null; openScore = new Set();
    document.querySelectorAll('#caseTabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.case === company.id)));
    $('#company').value = company.id;
    try { history.replaceState(null, '', '#' + company.id); } catch (e) { /* 미리보기 등에서 막힐 수 있음 */ }
    render(false);
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.case) load(d.case);
    else if (d.rm) { st.K06 = st.K06.filter((x) => x !== d.rm); update(`${d.rm} 삭제, 추천을 다시 계산했습니다`); }
    else if (b.id === 'addBtn') { const v = $('#addCountry').value; if (v && !st.K06.includes(v)) { st.K06.push(v); update(`${v} 추가, 추천을 다시 계산했습니다`); } }
    else if (d.seg) {
      const raw = d.v, v = raw === 'true' ? true : raw === 'false' ? false : raw;
      if (d.seg === 'item') st.item = v; else st[d.seg] = st[d.seg] === v ? null : v;
      update();
    }
    else if (d.own) { st.owned.add(d.own); update(`${T[d.own].name}을(를) 숨기고 다음 유형을 올렸습니다`); }
    else if (d.unown) { st.owned.delete(d.unown); update(); }
    else if (d.exp) { st.expanded.has(d.exp) ? st.expanded.delete(d.exp) : st.expanded.add(d.exp); render(false); }
    else if (d.score) { openScore.has(d.score) ? openScore.delete(d.score) : openScore.add(d.score); render(false); }
    else if (b.id === 'reset') { load(company.id); toast('신청서 값으로 되돌렸습니다'); }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'company') load(el.value);
    else if (el.id === 'K11' || el.id === 'K12') { st[el.id] = el.value === '' ? null : Math.max(0, parseInt(el.value, 10) || 0); update(); }
    else if (el.dataset && el.dataset.k16) { el.checked ? st.K16.add(el.dataset.k16) : st.K16.delete(el.dataset.k16); update(); }
  });

  $('#caseTabs').innerHTML = CASES.map((c) => `<button type="button" role="tab" data-case="${c.id}" aria-selected="false">${c.label}</button>`).join('');
  $('#company').innerHTML = D.companies.map((c) => `<option value="${c.id}">${c.id} | ${esc(c.stage)} | ${esc(c.item)}</option>`).join('');
  const start = (location.hash || '').replace('#', '').toUpperCase();
  load(D.companies.some((c) => c.id === start) ? start : 'CO-056');
})();
