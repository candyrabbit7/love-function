// Advice from the precomputed tables in data.js. Mirrors sim/web_logic.py (checked by sim/test_web.py).
var LoveLogic = (function () {
  function bucket(times, need) {
    for (var k = 0; k < times.length; k++) {
      if (times[k] >= need) return times[k];
    }
    return times[times.length - 1];
  }

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

  var MAX_COUNT = 30;   // the page's steppers stop at 30

  // decide(), plus for 'observe' how many more warm answers make the next step right (null: none up to 30)
  function withNeed(s, D) {
    var r = decide(s, D);
    var need = null;
    if (r.code === 'observe') {
      var target = s.stage === 1 ? 'step_up' : 'confess';
      for (var k = 1; s.warm + k <= MAX_COUNT; k++) {
        if (decide(Object.assign({}, s, { warm: s.warm + k }), D).code === target) { need = k; break; }
      }
    }
    return { code: r.code, need: need, r: r };
  }

  function brief(b) { return b ? { code: b.code, need: b.need } : null; }

  // The conclusion: what to do now, and what the model says after a warm (yes) or cold (no) answer to it.
  function conclude(s, D) {
    var now = withNeed(s, D), yes = null, no = null;
    if (now.code === 'step_up') {
      yes = withNeed(Object.assign({}, s, { stage: 2, warm: s.warm + 1 }), D);
      no = withNeed(Object.assign({}, s, { cold: s.cold + 1 }), D);
    } else if (now.code === 'observe') {
      no = withNeed(Object.assign({}, s, { cold: s.cold + 1 }), D);
    } else if (now.code === 'say_hi') {
      yes = withNeed(Object.assign({}, s, { stage: 1, warm: 1, cold: 0, yUnknown: true }), D);
      no = withNeed(Object.assign({}, s, { stage: 1, warm: 0, cold: 1, yUnknown: true }), D);
    }
    return { code: now.code, need: now.need, yes: brief(yes), no: brief(no), zone: now.r.zone, unicorn: now.r.unicorn };
  }

  function advise(s, D) {
    var c = conclude(s, D);
    var x = Math.round(s.x);
    var xs = (D.settings && D.settings.x_serious) || 7;
    var act = s.stage === 1 ? '约 TA 单独出来' : '表白';
    var res = { zone: c.zone, unicorn: c.unicorn, code: c.code, title: '', how: '', after: [], why: '' };
    var cold = s.cold, warm = s.warm;

    if (c.code === 'none_nogo') {
      res.title = '不用特意投入';
      res.how = '正常相处就好，不用专门花心思。';
      res.why = '心动还不到 5 分，不值得为这个专门花精力。';
      res.after = ['哪天心动多了 → 再回来看一次。'];
    } else if (c.code === 'none_danger') {
      res.title = '不建议往感情方向走';
      res.how = '正常相处就好，不用往恋爱方向投入。';
      res.why = '和你的心动比起来，TA 的作妖程度太高，投入下去消耗会比收获多。';
      res.after = ['相处下来发现 TA 没那么作 → 把作妖分调低，再看一次。'];
    } else if (c.code === 'flirt_hi' || c.code === 'flirt') {
      res.title = c.code === 'flirt_hi' ? '可以打个招呼，轻松认识' : '保持轻松相处，先不表白';
      res.how = c.code === 'flirt_hi' ? '见到时打个招呼、聊几句就好，不用特意约，也不用想太多。'
        : '一起参加活动、正常聊天就好，先不单独约，也不表白。';
      if (x < xs) {
        res.why = '心动还没到认真的程度（' + xs + ' 分以上才算），现在表白，代价比把握大。';
        res.after = ['心动到了 ' + xs + ' 分以上 → 再回来看要不要往前走。'];
      } else {
        res.why = '心动够了，但 TA 的作妖偏多，认真交往的消耗会比收获大。';
        res.after = ['相处下来发现 TA 没那么作 → 把作妖分调低，再看一次。'];
      }
    } else if (c.code === 'say_hi') {
      res.title = '去打个招呼';
      res.how = '下次见到时主动打个招呼，聊两三句：问问 TA 最近在忙什么，或者聊聊你们都在做的事。';
      res.why = '你挺心动，打个招呼几乎没有代价；不打招呼，就什么都不会发生。';
      res.after.push(c.yes.code === 'step_up' ? 'TA 回应热情、聊得来 → 下次就可以约 TA 单独出来。'
        : c.yes.code === 'observe' ? 'TA 回应热情 → 再多聊几次，熟一点再说。'
        : 'TA 回应热情 → 选「聊过几次」，再看一次。');
      res.after.push(c.no.code === 'stop' ? 'TA 很冷淡 → 就不用再特意接触了。'
        : 'TA 有点冷淡 → 不用急，偶尔一次冷淡可能只是 TA 忙，之后多接触看看。');
    } else if (c.code === 'wait') {
      res.title = '先不用特意接触，等自然的机会';
      res.how = '不用刻意制造机会，下次自然碰到时再打招呼。';
      res.why = '按你说的情况，现在主动的代价略大于收获。';
      res.after = ['自然聊上了 → 选「聊过几次」，再看一次。'];
    } else if (c.code === 'skip') {
      res.title = '可以不用特意接触';
      res.how = '正常相处就好，不用专门去认识。';
      res.why = '按你说的情况，专门去接触的代价比收获大。';
      res.after = ['如果 TA 主动来找你 → 选「聊过几次」，再看一次。'];
    } else if (c.code === 'step_up') {
      res.title = '约 TA 单独出来一次';
      res.how = '这一两周内约 TA 吃顿饭，或者一起做件具体的事（看展、自习、运动）。说清楚时间和地点，比「有空一起玩」更容易答应。';
      res.why = warm > cold ? 'TA 一直挺热情，你也够认真，拖下去更容易错过。'
        : '按你说的情况，往前一步的好处比被拒的风险大；拖下去更容易错过。';
      res.after.push(c.yes.code === 'confess' ? 'TA 爽快答应、相处愉快 → 下一步就可以表白了。'
        : c.yes.need ? 'TA 答应了 → 再多相处，TA 再热情 ' + c.yes.need + ' 次，就可以表白。'
        : 'TA 答应了 → 先多相处，之后选「已经熟了」再看一次。');
      res.after.push(c.no.code === 'step_up' ? 'TA 有事推掉 → 换个时间再约一次就好。'
        : c.no.code === 'stop' ? 'TA 推脱或敷衍 → 可以放下了。'
        : c.no.need ? 'TA 推脱或敷衍 → 先别再约，正常相处；TA 再热情回应 ' + c.no.need + ' 次，就可以再约。'
        : 'TA 推脱或敷衍 → 先别再约，正常相处，看 TA 之后的回应。');
    } else if (c.code === 'confess') {
      res.title = '可以表白了';
      res.how = '找一个只有你们两个人、不赶时间的场合，直接告诉 TA 你喜欢 TA，问 TA 愿不愿意试试在一起。说清楚就好，不用长篇大论，也别在群里或当着别人的面说。';
      res.why = warm > 0 ? 'TA 的回应已经够热情了；再拖下去，把握不会更大，TA 却可能有了别人。'
        : '按你说的情况，把握已经够了；再拖下去，TA 可能有了别人。';
      res.after = ['TA 答应 → 恭喜！慢慢相处。', 'TA 拒绝 → 尊重 TA 的决定，不追问、不反复表白，给彼此一点空间。'];
    } else if (c.code === 'observe') {
      res.title = s.stage === 1 ? '先别单独约，再多聊一阵' : '先别表白，再多相处一段时间';
      res.how = s.stage === 1 ? '保持现在的联系，多在一群人里一起做事，留意 TA 会不会主动找你、认真回你。'
        : '保持联系，多创造一起做事的机会，留意 TA 会不会主动找你、认真回你。';
      res.why = cold === 0 ? 'TA 的回应还不多，现在' + act + '有点早。'
        : warm === 0 ? 'TA 冷淡了 ' + cold + ' 次，还没有热情的回应，现在' + act + '，被拒的可能很大。'
        : 'TA 的回应有冷有热，现在' + act + '，被拒的可能偏大。';
      res.after.push(c.need ? 'TA 再热情回应 ' + c.need + ' 次 → 就可以' + act + '了。'
        : 'TA 明显主动起来（主动约你、找你聊）→ 回来更新次数，再看一次。');
      res.after.push(c.no.code === 'stop' ? 'TA 又冷淡了 → 可以放下了。'
        : c.no.need ? 'TA 又冷淡了 → 要等的热情会更多（要再热情 ' + c.no.need + ' 次）。'
        : 'TA 又冷淡了 → 就很难往前了，正常相处就好。');
    } else if (c.code === 'stop') {
      res.title = '可以放下了';
      res.how = '像普通朋友一样相处，不追问、不试探。';
      res.why = 'TA 的冷淡已经很多，继续投入不划算。';
      res.after = ['TA 主动靠近 → 回来更新次数，再看一次。'];
    }
    return res;
  }

  return { decide: decide, conclude: conclude, advise: advise, bucket: bucket };
})();

if (typeof module !== 'undefined') module.exports = LoveLogic;
