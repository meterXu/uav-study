const S = {
  droneX: 0, droneY: 0,
  droneHeading: 0,
  barrelRadius: 0.08,
  droneRadius: 0.054,
  correct: 0,
  total: 0,
  isAdvanced: false,
  answered: false,
  showAnswer: false,
  correctSX: 0, correctSY: 0,
  timeLimit: 3000,
  rightStickX: 0, rightStickY: 0,
  leftStickX: 0, leftStickY: 0,
  stickThreshold: 0.13,
};

Page({
  data: {
    correct: 0,
    total: 0,
    accuracy: '--%',
    isAdvanced: false,
    feedbackText: '',
    feedbackClass: '',
    showAnswer: false,
    answerDir: '',
    countdownWidth: 100,
    countdownAnimating: false,
    timeLimit: 3000,
  },

  onLoad() {
    S.correct = 0;
    S.total = 0;
    S.isAdvanced = false;
    S.answered = false;
    S.showAnswer = false;
    S.correctSX = 0;
    S.correctSY = 0;
    S.rightStickX = 0;
    S.rightStickY = 0;
    S.leftStickX = 0;
    S.leftStickY = 0;
    this.setData({
      correct: 0,
      total: 0,
      accuracy: '--%',
      isAdvanced: false,
      feedbackText: '',
      feedbackClass: '',
      showAnswer: false,
      countdownWidth: 100,
      countdownAnimating: false,
    });
  },

  onReady() {
    const query = wx.createSelectorQuery();
    query.select('#scene').fields({ node: true, size: true });
    query.select('#tx').fields({ node: true, size: true });
    query.select('#tx').boundingClientRect();
    query.exec((res) => {
      const sceneRes = res[0];
      const txRes = res[1];
      const txRect = res[2];
      if (!sceneRes || !txRes) return;

      this.sceneCanvas = sceneRes.node;
      this.sceneCtx = sceneRes.node.getContext('2d');
      this.txCanvas = txRes.node;
      this.txCtx = txRes.node.getContext('2d');
      this.txRect = { left: txRect.left, top: txRect.top };

      let dpr = 2;
      try {
        dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio;
      } catch (e) {}
      this.dpr = dpr;

      this._sizeSceneCanvas(sceneRes.width, sceneRes.height);
      this._sizeTxCanvas(txRes.width, txRes.height);

      this._loadImage();
      this.generateScene();

      this._resizeHandler = () => this.onResize();
      wx.onWindowResize(this._resizeHandler);
    });
  },

  onUnload() {
    this._clearTimers();
    if (this._resizeHandler) {
      wx.offWindowResize(this._resizeHandler);
      this._resizeHandler = null;
    }
  },

  _clearTimers() {
    if (this._countdownTimer) clearTimeout(this._countdownTimer);
    if (this._feedbackTimer) clearTimeout(this._feedbackTimer);
    if (this._nextTimer) clearTimeout(this._nextTimer);
    this._countdownTimer = null;
    this._feedbackTimer = null;
    this._nextTimer = null;
  },

  _sizeSceneCanvas(width, height) {
    const dpr = this.dpr;
    this.sceneCanvas.width = width * dpr;
    this.sceneCanvas.height = height * dpr;
    this.sceneCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.sceneW = width;
    this.sceneH = height;
    this.cx = width / 2;
    this.cy = height / 2;
    this.cr = (Math.min(width, height) * 0.88) / 2;
  },

  _sizeTxCanvas(width, height) {
    const dpr = this.dpr;
    this.txCanvas.width = width * dpr;
    this.txCanvas.height = height * dpr;
    this.txCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.txW = width;
    this.txH = height;
  },

  _loadImage() {
    this.planeLoaded = false;
    this.planeImg = this.sceneCanvas.createImage();
    this.planeImg.onload = () => {
      this.planeLoaded = true;
      this.renderScene();
    };
    this.planeImg.onerror = () => {
      this.planeLoaded = false;
    };
    this.planeImg.src = '/images/paper-airplane.png';
  },

  renderScene() {
    const ctx = this.sceneCtx;
    if (!ctx) return;
    const w = this.sceneW;
    const h = this.sceneH;
    const _cx = this.cx;
    const _cy = this.cy;
    const _r = this.cr;
    const _br = S.barrelRadius * _r;
    const _dr = S.droneRadius * _r;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(0, 0, w, h);

    ctx.beginPath();
    ctx.arc(_cx, _cy, _r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(56,189,248,0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const grad = ctx.createRadialGradient(_cx, _cy, 0, _cx, _cy, _r);
    grad.addColorStop(0, 'rgba(14,165,233,0.14)');
    grad.addColorStop(0.7, 'rgba(14,116,190,0.06)');
    grad.addColorStop(1, 'rgba(2,6,23,0.22)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(_cx, _cy, _r, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 1; i <= 3; i++) {
      const rr = (i / 4) * _r;
      ctx.beginPath();
      ctx.arc(_cx, _cy, rr, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(148,163,184,0.05)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = 'rgba(56,189,248,0.10)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(_cx - _r, _cy);
    ctx.lineTo(_cx + _r, _cy);
    ctx.moveTo(_cx, _cy - _r);
    ctx.lineTo(_cx, _cy + _r);
    ctx.stroke();
    ctx.setLineDash([]);

    // Barrel
    ctx.beginPath();
    ctx.arc(_cx, _cy, _br, 0, Math.PI * 2);
    const bg = ctx.createRadialGradient(_cx - _br * 0.3, _cy - _br * 0.3, 0, _cx, _cy, _br);
    bg.addColorStop(0, '#334155');
    bg.addColorStop(0.4, '#1e293b');
    bg.addColorStop(1, '#0f172a');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(_cx, _cy, _br * 0.6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(241,245,249,0.10)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Drone - paper airplane icon
    const dx = _cx + S.droneX * _r;
    const dy = _cy + S.droneY * _r;
    const hd = S.droneHeading;
    if (this.planeLoaded) {
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(hd);
      const wImg = _dr * 3.4;
      const hImg = wImg * (this.planeImg.height / this.planeImg.width);
      ctx.shadowColor = 'rgba(56,189,248,0.4)';
      ctx.shadowBlur = 14;
      ctx.drawImage(this.planeImg, -wImg / 2, -hImg / 2, wImg, hImg);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(dx, dy, _dr * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
    }

    const tbx = _cx - dx;
    const tby = _cy - dy;
    const tbd = Math.sqrt(tbx * tbx + tby * tby);

    const pct = Math.round((tbd / _r) * 100);
    ctx.fillStyle = 'rgba(148,163,184,0.55)';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(pct + '% 偏离', _cx, _cy + _r + 6);

    if (S.showAnswer) {
      const tbmag = Math.sqrt(tbx * tbx + tby * tby) || 1;
      const ux = tbx / tbmag;
      const uy = tby / tbmag;
      const alen = _dr * 8;
      this.drawArrow(ctx, dx, dy, dx + ux * alen, dy + uy * alen, 'rgba(74,222,128,0.95)');
    }
  },

  renderTx() {
    const ctx = this.txCtx;
    if (!ctx) return;
    const w = this.txW;
    const h = this.txH;
    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#111827');
    bg.addColorStop(0.5, '#0f172a');
    bg.addColorStop(1, '#0a0f1a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const px = w * 0.04;
    const py = h * 0.04;
    const bw = w - px * 2;
    const bh = h - py * 2;
    const rr = 10;

    ctx.beginPath();
    ctx.moveTo(px + rr, py);
    ctx.lineTo(px + bw - rr, py);
    ctx.quadraticCurveTo(px + bw, py, px + bw, py + rr);
    ctx.lineTo(px + bw, py + bh - rr);
    ctx.quadraticCurveTo(px + bw, py + bh, px + bw - rr, py + bh);
    ctx.lineTo(px + rr, py + bh);
    ctx.quadraticCurveTo(px, py + bh, px, py + bh - rr);
    ctx.lineTo(px, py + rr);
    ctx.quadraticCurveTo(px, py, px + rr, py);
    ctx.closePath();
    const bf = ctx.createLinearGradient(0, py, 0, py + bh);
    bf.addColorStop(0, '#1e293b');
    bf.addColorStop(0.3, '#16202f');
    bf.addColorStop(0.7, '#0f172a');
    bf.addColorStop(1, '#0b1220');
    ctx.fillStyle = bf;
    ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const marginX = w * 0.15;
    const marginY = h * 0.12;
    const gR = Math.min(w * 0.12, h * 0.18);
    const lcx = marginX + gR + w * 0.04;
    const lcy = marginY + gR + h * 0.04;
    const rcx = w - marginX - gR - w * 0.04;
    const rcy = lcy;

    ctx.fillStyle = 'rgba(148,163,184,0.55)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('左摇杆', lcx, marginY - 8);
    ctx.fillStyle = 'rgba(100,116,139,0.4)';
    ctx.font = '7px sans-serif';
    ctx.fillText('油门', lcx, marginY + gR * 2 + 18);
    ctx.fillText('偏航', lcx, marginY + gR * 2 + 30);

    ctx.fillStyle = 'rgba(245,158,11,0.7)';
    ctx.font = '9px sans-serif';
    ctx.fillText('右摇杆', rcx, marginY - 8);
    ctx.fillStyle = 'rgba(100,116,139,0.4)';
    ctx.font = '7px sans-serif';
    ctx.fillText('俯仰/横滚', rcx, marginY + gR * 2 + 18);

    this.drawGimbal(ctx, lcx, lcy, gR, S.leftStickX, S.leftStickY, false);
    this.drawGimbal(ctx, rcx, rcy, gR, S.rightStickX, S.rightStickY, true);

    if (S.showAnswer) {
      const gcx = rcx;
      const gcy = rcy;
      const arad = gR * 1.25;
      this.drawArrow(ctx, gcx, gcy, gcx + S.correctSX * arad, gcy + S.correctSY * arad, 'rgba(74,222,128,0.95)');
    }
  },

  drawGimbal(ctx, cx, cy, radius, sx, sy, highlight) {
    const r = radius;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 0, cx, cy, r);
    g.addColorStop(0, highlight ? 'rgba(14,165,233,0.28)' : 'rgba(30,41,59,0.3)');
    g.addColorStop(0.7, highlight ? 'rgba(14,116,190,0.16)' : 'rgba(15,23,42,0.2)');
    g.addColorStop(1, 'rgba(10,15,26,0.3)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = highlight ? 'rgba(56,189,248,0.4)' : 'rgba(71,85,105,0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const ir = r * 0.7;
    ctx.beginPath();
    ctx.arc(cx, cy, ir, 0, Math.PI * 2);
    ctx.strokeStyle = highlight ? 'rgba(56,189,248,0.14)' : 'rgba(71,85,105,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const kx = cx + sx * ir;
    const ky = cy + sy * ir;
    const kr = r * 0.25;

    ctx.beginPath();
    ctx.arc(kx + 1.5, ky + 2, kr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(kx, ky, kr, 0, Math.PI * 2);
    const kg = ctx.createRadialGradient(kx - kr * 0.3, ky - kr * 0.3, 0, kx, ky, kr);
    kg.addColorStop(0, highlight ? '#7dd3fc' : '#94a3b8');
    kg.addColorStop(0.5, highlight ? '#0ea5e9' : '#475569');
    kg.addColorStop(1, highlight ? '#0369a1' : '#1e293b');
    ctx.fillStyle = kg;
    ctx.fill();
    ctx.strokeStyle = highlight ? 'rgba(125,211,252,0.5)' : 'rgba(148,163,184,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(kx - kr * 0.2, ky - kr * 0.2, kr * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();

    if (highlight) {
      ctx.fillStyle = 'rgba(56,189,248,0.35)';
      ctx.font = '7px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('↑', cx, cy - r - 5);
      ctx.fillText('↓', cx, cy + r + 5);
      ctx.fillText('←', cx - r - 5, cy);
      ctx.fillText('→', cx + r + 5, cy);
    }
  },

  drawArrow(ctx, x1, y1, x2, y2, color) {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const head = 9;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(ang - 0.45) * head, y2 - Math.sin(ang - 0.45) * head);
    ctx.lineTo(x2 - Math.cos(ang + 0.45) * head, y2 - Math.sin(ang + 0.45) * head);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  },

  getGimbalCenters() {
    const w = this.txW;
    const h = this.txH;
    const marginX = w * 0.15;
    const marginY = h * 0.12;
    const gR = Math.min(w * 0.12, h * 0.18);
    const lcx = marginX + gR + w * 0.04;
    const lcy = marginY + gR + h * 0.04;
    const rcx = w - marginX - gR - w * 0.04;
    return { lcx, lcy, rcx, rcy: lcy, gR };
  },

  hitStick(mx, my) {
    const c = this.getGimbalCenters();
    const hh = c.gR + 8;
    if (Math.abs(mx - c.lcx) < hh && Math.abs(my - c.lcy) < hh) return 'left';
    if (Math.abs(mx - c.rcx) < hh && Math.abs(my - c.rcy) < hh) return 'right';
    return null;
  },

  updateStick(mx, my) {
    if (!this.activeStick) return;
    const c = this.getGimbalCenters();
    const _cx = this.activeStick === 'left' ? c.lcx : c.rcx;
    const _cy = this.activeStick === 'left' ? c.lcy : c.rcy;
    let dx = mx - _cx;
    let dy = my - _cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    const maxD = c.gR * 0.7;
    if (d > maxD) {
      dx = (dx / d) * maxD;
      dy = (dy / d) * maxD;
    }
    const nx = dx / maxD;
    const ny = dy / maxD;
    if (this.activeStick === 'left') {
      S.leftStickX = nx;
      S.leftStickY = ny;
    } else {
      S.rightStickX = nx;
      S.rightStickY = ny;
    }
    this.renderTx();
  },

  releaseStick() {
    if (this.activeStick === 'right' && !S.answered && this.mouseDown) {
      this.evaluateAnswer(S.rightStickX, S.rightStickY);
    }
    if (this.activeStick === 'right') {
      S.rightStickX = 0;
      S.rightStickY = 0;
    } else if (this.activeStick === 'left') {
      S.leftStickX = 0;
      S.leftStickY = 0;
    }
    this.activeStick = null;
    this.mouseDown = false;
    this.renderTx();
  },

  _getTouch(e) {
    if (e.touches && e.touches.length) return e.touches[0];
    if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0];
    return null;
  },

  _getPos(t) {
    if (t && t.x !== undefined && t.y !== undefined) {
      return { mx: t.x, my: t.y };
    }
    const rect = this.txRect || { left: 0, top: 0 };
    return { mx: t.clientX - rect.left, my: t.clientY - rect.top };
  },

  onTxTouchStart(e) {
    const t = this._getTouch(e);
    if (!t) return;
    const p = this._getPos(t);
    const hit = this.hitStick(p.mx, p.my);
    if (hit) {
      this.activeStick = hit;
      this.mouseDown = true;
      this.updateStick(p.mx, p.my);
    }
  },

  onTxTouchMove(e) {
    if (!this.mouseDown || !this.activeStick) return;
    const t = this._getTouch(e);
    if (!t) return;
    const p = this._getPos(t);
    this.updateStick(p.mx, p.my);
  },

  onTxTouchEnd(e) {
    this.releaseStick();
  },

  evaluateAnswer(stickX, stickY) {
    if (S.answered) return;
    S.answered = true;
    S.total++;
    if (this._countdownTimer) {
      clearTimeout(this._countdownTimer);
      this._countdownTimer = null;
    }
    this.setData({ countdownAnimating: false });

    const stickMag = Math.sqrt(stickX * stickX + stickY * stickY);
    let match = false;
    if (stickMag >= S.stickThreshold) {
      const toCX = -S.droneX;
      const toCY = -S.droneY;
      const worldAngle = Math.atan2(toCY, toCX);
      const hd = S.droneHeading;
      const vx = -stickY * Math.cos(hd) - stickX * Math.sin(hd);
      const vy = -stickY * Math.sin(hd) + stickX * Math.cos(hd);
      const velocityAngle = Math.atan2(vy, vx);
      let diff = velocityAngle - worldAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      match = Math.abs(diff) < Math.PI / 4;
    }

    if (match) S.correct++;
    this.updateUI();
    if (match) {
      this._showFeedback(true);
      this._nextTimer = setTimeout(() => this.generateScene(), 600);
    } else {
      this._showFeedback(false);
      this.showAnswerSolution();
    }
  },

  _showFeedback(ok) {
    this.setData({
      feedbackText: ok ? '正确!' : '错误',
      feedbackClass: ok ? 'correct' : 'wrong',
    });
    if (this._feedbackTimer) clearTimeout(this._feedbackTimer);
    this._feedbackTimer = setTimeout(() => {
      this.setData({ feedbackText: '', feedbackClass: '' });
    }, 600);
  },

  computeCorrectAnswer() {
    const toCX = -S.droneX;
    const toCY = -S.droneY;
    const mag = Math.sqrt(toCX * toCX + toCY * toCY) || 1;
    const ux = toCX / mag;
    const uy = toCY / mag;
    const hd = S.droneHeading;
    const sh = Math.sin(hd);
    const ch = Math.cos(hd);
    S.correctSX = -sh * ux + ch * uy;
    S.correctSY = -ch * ux - sh * uy;
  },

  stickDirText(sx, sy) {
    const up = -sy;
    const right = sx;
    const v = up >= 0.3 ? '上' : up <= -0.3 ? '下' : '';
    const hz = right >= 0.3 ? '右' : right <= -0.3 ? '左' : '';
    return v + hz || '正中';
  },

  showAnswerSolution() {
    S.showAnswer = true;
    this.computeCorrectAnswer();
    const dir = this.stickDirText(S.correctSX, S.correctSY);
    this.setData({ showAnswer: true, answerDir: dir });
    this.renderScene();
    this.renderTx();
  },

  onAnswerOk() {
    S.showAnswer = false;
    this.setData({ showAnswer: false });
    this.generateScene();
  },

  updateUI() {
    const pct = S.total > 0 ? Math.round((S.correct / S.total) * 100) : 0;
    this.setData({
      correct: S.correct,
      total: S.total,
      accuracy: S.total > 0 ? pct + '%' : '--%',
    });
  },

  generateScene() {
    const angle = Math.random() * Math.PI * 2;
    const dist = 0.3 + Math.random() * 0.55;
    S.droneX = Math.cos(angle) * dist;
    S.droneY = Math.sin(angle) * dist;
    S.droneHeading = (Math.random() - 0.5) * Math.PI * 2;

    S.answered = false;
    S.rightStickX = 0;
    S.rightStickY = 0;
    S.leftStickX = 0;
    S.leftStickY = 0;
    S.showAnswer = false;
    this.activeStick = null;
    this.mouseDown = false;

    this.setData({ feedbackText: '', feedbackClass: '', showAnswer: false });
    this.restartCountdown();
    this.renderScene();
    this.renderTx();
  },

  restartCountdown() {
    if (this._countdownTimer) {
      clearTimeout(this._countdownTimer);
      this._countdownTimer = null;
    }
    this.setData({ countdownWidth: 100, countdownAnimating: false });
    if (S.isAdvanced && !S.answered) {
      setTimeout(() => {
        this.setData({ countdownAnimating: true, countdownWidth: 0 });
      }, 30);
      this._countdownTimer = setTimeout(() => this.onCountdownTimeout(), S.timeLimit);
    }
  },

  onCountdownTimeout() {
    if (S.answered) return;
    S.answered = true;
    S.total++;
    S.correctSX = 0;
    S.correctSY = 0;
    this._showFeedback(false);
    this.updateUI();
    this.showAnswerSolution();
  },

  setFree() {
    this.setMode(false);
  },

  setAdv() {
    this.setMode(true);
  },

  setMode(advanced) {
    S.isAdvanced = advanced;
    this.setData({ isAdvanced: advanced });
    if (advanced && !S.answered) {
      this.restartCountdown();
    } else if (!advanced) {
      if (this._countdownTimer) {
        clearTimeout(this._countdownTimer);
        this._countdownTimer = null;
      }
      this.setData({ countdownAnimating: false, countdownWidth: 100 });
    }
  },

  onResize() {
    const query = wx.createSelectorQuery();
    query.select('#scene').fields({ node: true, size: true });
    query.select('#tx').fields({ node: true, size: true });
    query.select('#tx').boundingClientRect();
    query.exec((res) => {
      if (!res[0] || !res[1]) return;
      this.txRect = { left: res[2].left, top: res[2].top };
      this._sizeSceneCanvas(res[0].width, res[0].height);
      this._sizeTxCanvas(res[1].width, res[1].height);
      this.renderScene();
      this.renderTx();
    });
  },
});
