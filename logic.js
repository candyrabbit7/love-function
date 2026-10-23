// Advice from the precomputed tables in data.js. Mirrors sim/web_logic.py (checked by sim/test_web.py).
var LoveLogic = (function () {
  function bucket(times, need) {
    for (var k = 0; k < times.length; k++) {
      if (times[k] >= need) return times[k];
    }
    return times[times.length - 1];
  }

  function pct(p) { return Math.round(100 * p) + '%'; }

  function decide(s, D) {
    var x = Math.max(0, Math.min(10, Math.round(s.x)));
    var yKnown = s.stage >= 1 && !s.yUnknown;
    var z = D.zones[x + '|' + (yKnown ? s.y : 'u')];
    var out = { zone: z, unicorn: yKnown && z.reason === 'unicorn', code: '', needWarm: null, pStar: null,
                t: null, j: null, imin: null };
    if (z.level === 0) {
      out.code = z.reason === 'danger' ? 'none_danger' : 'none_nogo';
      return out;
    }
    if (z.level === 1) {
      out.code = s.stage === 0 ? 'flirt_hi' : 'flirt';
      return out;
    }
    var key = [x, yKnown ? 'k' : 'u', s.prior, s.reject, s.miss].join('|');
    var rule = D.rules[key];
    if (!rule) {
      out.code = s.stage === 0 ? 'flirt_hi' : 'flirt';
      return out;
    }
    out.pStar = rule.p_star;
    if (s.stage === 0) {
      out.code = { advance: 'say_hi', ask: 'say_hi', hold: 'wait', stop: 'skip' }[rule.first];
      return out;
    }
    var jMax = D.settings.j_max;
    var times = s.stage === 1 ? D.settings.stage1_times : D.settings.stage2_times;
    var table = s.stage === 1 ? rule.s1 : rule.s2;
    var t = bucket(times, Math.max(s.weeks, s.warm + s.cold));
    var j = Math.min(s.cold, jMax);
    var row = table[String(t)][j];
    var imin = row[0], fallback = row[1];
    out.t = t; out.j = j; out.imin = imin;
    if (imin >= 0 && s.cold <= jMax && s.warm >= imin) {
      out.code = s.stage === 1 ? 'step_up' : 'confess';
    } else if (fallback === 'stop') {
      out.code = 'stop';
    } else {
      out.code = 'observe';
      if (imin >= 0 && s.cold <= jMax) out.needWarm = imin - s.warm;
    }
    return out;
  }

  function advise(s, D) {
    var r = decide(s, D);
    var x = Math.round(s.x);
    var xs = (D.settings && D.settings.x_serious) || 7;
    var flirtWhy = x < xs
      ? '心动在 5–' + (xs - 1) + ' 分，按模型算，这个程度适合暧昧和多接触，表白的代价大于把握。心动到 ' + xs + ' 分以上，再按规则看。'
      : '心动够了，但作妖偏多。按模型算，这个组合适合暧昧和多接触，认真交往的消耗大于收获。';
    var T = {
      none_nogo: ['不用特意投入', '心动还不到 5 分。按模型算，现在不值得专门花精力。'],
      none_danger: ['不建议往前', '和心动程度相比，作妖程度太高。按模型算，投入下去，消耗会超过收获。'],
      flirt_hi: ['可以去打个招呼', '心动在 5–' + (xs - 1) + ' 分，适合轻松认识、多接触，先不用考虑表白。'],
      flirt: ['保持轻松相处，先不表白', flirtWhy],
      say_hi: ['去打个招呼', '心动 ' + x + ' 分，值得认识一下。之后看 TA 的回应，再决定下一步。'],
      wait: ['先等等，找个自然的机会', '按模型算，现在主动的代价略大于收获。'],
      skip: ['可以不用特意接触', '按模型算，现在投入不划算。'],
      step_up: ['可以再往前一步', '比如单独约一次，或者一起做件事。'],
      confess: ['可以表明心意了', '从 TA 目前的回应看，把握已经够了。'],
      observe: ['先继续相处，再看看', '现在推进有点早，再多看几次 TA 的回应。'],
      stop: ['可以放下了', 'TA 的冷淡已经很多。按模型算，继续投入不划算。']
    };
    var res = { zone: r.zone, unicorn: r.unicorn, code: r.code, title: T[r.code][0], why: T[r.code][1], why2: '', tips: [] };
    if (r.pStar !== null && r.pStar !== undefined && s.stage === 2) {
      res.why += ' 按你的情况，只要 TA 答应的可能超过约 ' + pct(r.pStar) + '，表白就值得试。';
    } else if (r.pStar !== null && r.pStar !== undefined && s.stage === 1) {
      res.why += ' 等熟了以后，只要 TA 答应的可能超过约 ' + pct(r.pStar) + '，表白就值得试。';
    }
    if (r.t !== null) {
      var parts = ['你已经收到 ' + s.warm + ' 次热情、' + s.cold + ' 次冷淡。'];
      if (r.imin >= 0 && s.cold <= 10) {
        parts.push('冷淡 ' + r.j + ' 次时，' + (r.imin === 0 ? '规则不要求热情回应。'
          : '规则要求至少 ' + r.imin + ' 次热情' + (r.needWarm > 0 ? '，还差 ' + r.needWarm + ' 次。' : '。')));
      } else {
        parts.push('冷淡 ' + r.j + (s.cold > 10 ? ' 次以上' : ' 次') + '时，按规则先别推进。');
      }
      res.why2 = parts.join('');
    }
    res.tips.push('TA 拒绝或者没有回应，就尊重 TA，不要反复推进。');
    if (s.weeks >= 26 && (r.code === 'observe' || r.code === 'flirt')) {
      res.tips.push('已经认识很久了：等得越久，TA 越可能有了别人。');
    }
    if (s.stage >= 1 && !s.yUnknown && x >= 9) {
      res.tips.push('心动很高的时候，作妖分容易打低，冷静的时候再想一想。');
    }
    res.tips.push('这是模型的推算，不是对 TA 的判断。');
    return res;
  }

  return { decide: decide, advise: advise, bucket: bucket };
})();

if (typeof module !== 'undefined') module.exports = LoveLogic;
