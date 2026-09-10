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
  roundStart: 0,
  roundId: '',
  paused: false,
  // iconify SVG paths (24x24 coordinate space)
  ICON_PAUSE: 'M13,10H14V14H13V10M10,10H11V14H10V10M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M9,16V8H11V16H9M13,16V8H15V16H13Z',
  PLANE_PATH: 'M2,3L22,12L2,21V15L16,12L2,9V3Z',
};

Page({
  data: {
    accuracy: '--%',
    isAdvanced: false,
    feedbackText: '',
    hintText: '',
    feedbackClass: '',
    showAnswer: false,
    answerDir: '',
    answerType: 'wrong',
    countdownWidth: 100,
    countdownAnimating: false,
    timeLimit: 3000,
  },

  onLoad() {
    S.correct = 0;
    S.total = 0;
    S.visitCount = 0;
    S.isAdvanced = false;
    S.answered = false;
    S.showAnswer = false;
    S.correctSX = 0;
    S.correctSY = 0;
    S.rightStickX = 0;
    S.rightStickY = 0;
    S.leftStickX = 0;
    S.leftStickY = 0;
    S.roundStart = Date.now();
    S.roundId = Date.now() + '-' + Math.floor(Math.random() * 1000);
    S.paused = false;
    this.setData({
      accuracy: '--%',
      isAdvanced: false,
      feedbackText: '',
      feedbackClass: '',
      showAnswer: false,
      countdownWidth: 100,
      countdownAnimating: false,
      paused: false,
    });
  },

  onReady() {
    const query = wx.createSelectorQuery();
    query.select('#scene').fields({ node: true, size: true });
    query.select('#scene').boundingClientRect();
    query.select('#tx').fields({ node: true, size: true });
    query.select('#tx').boundingClientRect();
    query.exec((res) => {
      const sceneRes = res[0];
      const sceneRect = res[1];
      const txRes = res[2];
      const txRect = res[3];
      if (!sceneRes || !txRes) return;

      this.sceneCanvas = sceneRes.node;
      this.sceneCtx = sceneRes.node.getContext('2d');
      this.txCanvas = txRes.node;
      this.txCtx = txRes.node.getContext('2d');
      this.txRect = { left: txRect.left, top: txRect.top };
      this.sceneRect = { left: sceneRect.left, top: sceneRect.top };

      let dpr = 2;
      try {
        dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio;
      } catch (e) {}
      this.dpr = dpr;

      this._sizeSceneCanvas(sceneRes.width, sceneRes.height);
      this._sizeTxCanvas(txRes.width, txRes.height);

      this._initPaths();
      this.generateScene();

      this._resizeHandler = () => this.onResize();
      wx.onWindowResize(this._resizeHandler);
    });
  },

  onUnload() {
    this._clearTimers();
    this.saveRound();
    if (this._resizeHandler) {
      wx.offWindowResize(this._resizeHandler);
      this._resizeHandler = null;
    }
  },

  _clearTimers() {
    this._stopCountdown();
    if (this._feedbackTimer) clearTimeout(this._feedbackTimer);
    if (this._nextTimer) clearTimeout(this._nextTimer);
    this._feedbackTimer = null;
    this._nextTimer = null;
  },

  _stopCountdown() {
    if (this._countdownTimer) {
      clearTimeout(this._countdownTimer);
      this._countdownTimer = null;
    }
    if (this._countdownTicker) {
      clearInterval(this._countdownTicker);
      this._countdownTicker = null;
    }
  },

  _startCountdown(duration, full) {
    this._stopCountdown();
    const total = full || duration;
    this._cdFull = total;
    this._cdDeadline = Date.now() + duration;
    this._countdownTicker = setInterval(() => {
      const remain = Math.max(0, this._cdDeadline - Date.now());
      const pct = (remain / total) * 100;
      this.setData({ countdownWidth: pct });
      if (remain <= 0 && this._countdownTicker) {
        clearInterval(this._countdownTicker);
        this._countdownTicker = null;
      }
    }, 50);
    this._countdownTimer = setTimeout(() => this.onCountdownTimeout(), duration);
  },

  _pauseCountdown() {
    if (!this._countdownTimer && !this._countdownTicker) return;
    this._cdRemain = Math.max(0, this._cdDeadline - Date.now());
    this._stopCountdown();
  },

  _resumeCountdown() {
    if (S.isAdvanced && !S.answered && this._cdRemain > 0 && this._cdFull) {
      this._startCountdown(this._cdRemain, this._cdFull);
    }
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

  _initPaths() {
    // 预创建 iconify 图标的 Path2D 对象供 Canvas 直接绘制
    this._planePath2D = new Path2D(S.PLANE_PATH);
  },

  _drawIconPath(ctx, path, cx, cy, size, color) {
    // 复用 CanvasRenderingContext2D 的 Path2D 能力绘制 SVG path（iconify 图标为 24x24 坐标）
    const p = new Path2D(path);
    const scale = size / 24;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-12, -12);
    ctx.fillStyle = color;
    ctx.fill(p);
    ctx.restore();
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
    ctx.fillStyle = '#f0f4f8';
    ctx.fillRect(0, 0, w, h);

    ctx.beginPath();
    ctx.arc(_cx, _cy, _r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(148,163,184,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const grad = ctx.createRadialGradient(_cx, _cy, 0, _cx, _cy, _r);
    grad.addColorStop(0, 'rgba(37,99,235,0.06)');
    grad.addColorStop(0.7, 'rgba(37,99,235,0.055)');
    grad.addColorStop(1, 'rgba(203,213,225,0.15)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(_cx, _cy, _r, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 1; i <= 3; i++) {
      const rr = (i / 4) * _r;
      ctx.beginPath();
      ctx.arc(_cx, _cy, rr, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(148,163,184,0.08)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = 'rgba(239,68,68,0.3)';
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
    bg.addColorStop(0, '#fef2f2');
    bg.addColorStop(0.4, '#fecaca');
    bg.addColorStop(1, '#fca5a5');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(_cx, _cy, _br * 0.6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(239,68,68,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Drone - paper airplane icon (iconify mdi-paper-plane)
    const dx = _cx + S.droneX * _r;
    const dy = _cy + S.droneY * _r;
    const hd = S.droneHeading;
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(hd);
    ctx.shadowColor = 'rgba(249,115,22,0.45)';
    ctx.shadowBlur = 16;
    this._drawIconPath(ctx, S.PLANE_PATH, 0, 0, _dr * 2.6, '#ea580c');
    ctx.restore();

    const tbx = _cx - dx;
    const tby = _cy - dy;
    const tbd = Math.sqrt(tbx * tbx + tby * tby);

    const pct = Math.round((tbd / _r) * 100);
    ctx.fillStyle = 'rgba(148,163,184,0.7)';
    ctx.font = 'bold 11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(pct + '% 偏离', _cx, _cy + _r + 10);

    // Direction labels
    ctx.fillStyle = 'rgba(148,163,184,0.4)';
    ctx.font = 'bold 10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', _cx, _cy - _r + 12);
    ctx.fillText('S', _cx, _cy + _r - 12);
    ctx.fillText('W', _cx - _r + 12, _cy);
    ctx.fillText('E', _cx + _r - 12, _cy);

    if (S.showAnswer) {
      const tbmag = Math.sqrt(tbx * tbx + tby * tby) || 1;
      const ux = tbx / tbmag;
      const uy = tby / tbmag;
      const alen = _dr * 8;
      this.drawArrow(ctx, dx, dy, dx + ux * alen, dy + uy * alen, 'rgba(22,163,74,0.95)');
    }

    // 暂停态遮罩
    if (S.paused) {
      ctx.fillStyle = 'rgba(15,23,42,0.28)';
      ctx.beginPath();
      ctx.arc(_cx, _cy, _r, 0, Math.PI * 2);
      ctx.fill();

      // 暂停图标（iconify mdi pause-circle-outline）
      this._drawIconPath(ctx, S.ICON_PAUSE, _cx, _cy - 18, _r * 0.34, '#ffffff');

      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 20px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('已暂停', _cx, _cy + 22);

      ctx.fillStyle = 'rgba(148,163,184,0.9)';
      ctx.font = '12px -apple-system, sans-serif';
      ctx.fillText('点击圆圈继续', _cx, _cy + 46);
    }
  },

  renderTx() {
    const ctx = this.txCtx;
    if (!ctx) return;
    const w = this.txW;
    const h = this.txH;
    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#fef2f2');
    bg.addColorStop(0.5, '#fdfdfd');
    bg.addColorStop(1, '#f8fafc');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const px = w * 0.03;
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
    bf.addColorStop(0, '#ffffff');
    bf.addColorStop(0.3, '#f8fafc');
    bf.addColorStop(0.7, '#f1f5f9');
    bf.addColorStop(1, '#f0f4f8');
    ctx.fillStyle = bf;
    ctx.fill();
    ctx.strokeStyle = 'rgba(203,213,225,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const marginX = w * 0.08;
    const marginY = h * 0.09;
    const gR = Math.min(w * 0.18, h * 0.34);
    const lcx = marginX + gR + w * 0.03;
    const lcy = h * 0.50;
    const rcx = w - marginX - gR - w * 0.03;
    const rcy = lcy;

    ctx.fillStyle = 'rgba(100,116,139,0.65)';
    ctx.font = 'bold 12px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('左摇杆', lcx, marginY + 4);

    ctx.fillStyle = 'rgba(37,99,235,0.8)';
    ctx.font = 'bold 12px -apple-system, sans-serif';
    ctx.fillText('右摇杆', rcx, marginY + 4);

    this.drawGimbal(ctx, lcx, lcy, gR, S.leftStickX, S.leftStickY, false);
    this.drawGimbal(ctx, rcx, rcy, gR, S.rightStickX, S.rightStickY, true);

    if (S.showAnswer) {
      const gcx = rcx;
      const gcy = rcy;
      const arad = gR * 1.25;
      this.drawArrow(ctx, gcx, gcy, gcx + S.correctSX * arad, gcy + S.correctSY * arad, 'rgba(22,163,74,0.95)');
    }
  },

  drawGimbal(ctx, cx, cy, radius, sx, sy, highlight) {
    const r = radius;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 0, cx, cy, r);
    g.addColorStop(0, highlight ? 'rgba(37,99,235,0.15)' : 'rgba(226,232,240,0.6)');
    g.addColorStop(0.7, highlight ? 'rgba(37,99,235,0.08)' : 'rgba(248,250,252,0.4)');
    g.addColorStop(1, 'rgba(203,213,225,0.3)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = highlight ? 'rgba(37,99,235,0.35)' : 'rgba(203,213,225,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const ir = r * 0.7;
    ctx.beginPath();
    ctx.arc(cx, cy, ir, 0, Math.PI * 2);
    ctx.strokeStyle = highlight ? 'rgba(37,99,235,0.15)' : 'rgba(226,232,240,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const kx = cx + sx * ir;
    const ky = cy + sy * ir;
    const kr = r * 0.34;

    ctx.beginPath();
    ctx.arc(kx + 2, ky + 2.5, kr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(kx, ky, kr, 0, Math.PI * 2);
    const kg = ctx.createRadialGradient(kx - kr * 0.3, ky - kr * 0.3, 0, kx, ky, kr);
    kg.addColorStop(0, highlight ? '#93c5fd' : '#ffffff');
    kg.addColorStop(0.5, highlight ? '#3b82f6' : '#cbd5e1');
    kg.addColorStop(1, highlight ? '#1d4ed8' : '#94a3b8');
    ctx.fillStyle = kg;
    ctx.fill();
    ctx.strokeStyle = highlight ? 'rgba(59,130,246,0.6)' : 'rgba(203,213,225,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(kx - kr * 0.2, ky - kr * 0.2, kr * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fill();

    if (highlight) {
      ctx.fillStyle = 'rgba(37,99,235,0.6)';
      ctx.font = 'bold 10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
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
    const marginX = w * 0.08;
    const marginY = h * 0.09;
    const gR = Math.min(w * 0.18, h * 0.34);
    const lcx = marginX + gR + w * 0.03;
    const lcy = h * 0.50;
    const rcx = w - marginX - gR - w * 0.03;
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

  onSceneTouch(e) {
    const t = e.touches && e.touches[0];
    if (!t) return;
    let mx = t.x;
    let my = t.y;
    if (mx === undefined || my === undefined) {
      const rect = this.sceneRect || { left: 0, top: 0 };
      mx = t.clientX - rect.left;
      my = t.clientY - rect.top;
    }
    if (this.cx == null || this.cr == null) return;
    const dist = Math.sqrt((mx - this.cx) * (mx - this.cx) + (my - this.cy) * (my - this.cy));
    if (dist > this.cr) return;
    this.togglePause();
  },

  togglePause() {
    if (S.answered) return;
    S.paused = !S.paused;
    if (S.paused) {
      this._pauseCountdown();
    } else {
      this._resumeCountdown();
    }
    this.setData({ paused: S.paused });
    this.renderScene();
  },

  evaluateAnswer(stickX, stickY) {
    if (S.answered || S.paused) return;
    S.answered = true;
    S.total++;
    this._stopCountdown();
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
    this.saveRound();
    if (match) {
      this._showFeedback(true);
      this._nextTimer = setTimeout(() => this.generateScene(), 1500);
    } else {
      this._showFeedback(false);
      this.showAnswerSolution('wrong');
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
    }, 1200);
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

  showAnswerSolution(type) {
    S.showAnswer = true;
    this.computeCorrectAnswer();
    const dir = this.stickDirText(S.correctSX, S.correctSY);
    this.setData({ showAnswer: true, answerDir: dir, answerType: type || 'wrong' });
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
      accuracy: S.total > 0 ? pct + '%' : '--%',
    });
  },

  newPractice() {
    // 结束当前轮并入库存档，再开启新一轮
    this.saveRound();
    this.startRound();
    this._clearTimers();
    this.generateScene();
  },

  showStats() {
    wx.navigateTo({ url: '/pages/stats/stats' });
  },

  startRound() {
    S.correct = 0;
    S.total = 0;
    S.roundStart = Date.now();
    S.roundId = Date.now() + '-' + Math.floor(Math.random() * 1000);
    S.paused = false;
    this.setData({ accuracy: '--%', paused: false });
  },

  saveRound() {
    if (S.total <= 0) return;
    const correct = S.correct;
    const total = S.total;
    const accuracy = Math.round((correct / total) * 100) + '%';
    const durationSec = Math.max(0, Math.round((Date.now() - S.roundStart) / 1000));
    const round = {
      id: S.roundId,
      mode: S.isAdvanced ? '挑战模式' : '自由练习',
      total,
      correct,
      accuracy,
      time: this._formatTime(new Date(S.roundStart)),
      durationSec,
    };
    let rounds = [];
    try {
      rounds = wx.getStorageSync('practiceRounds') || [];
      if (!Array.isArray(rounds)) rounds = [];
    } catch (e) {}
    const idx = rounds.findIndex((r) => r.id === round.id);
    if (idx >= 0) {
      rounds[idx] = round;
    } else {
      rounds.unshift(round);
    }
    if (rounds.length > 500) rounds = rounds.slice(0, 500);
    wx.setStorageSync('practiceRounds', rounds);
  },

  _formatTime(d) {
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
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
    S.visitCount = (S.visitCount || 0) + 1;
    this.activeStick = null;
    this.mouseDown = false;

    this.setData({ feedbackText: '', feedbackClass: '', showAnswer: false, hintText: '' });
    this.restartCountdown();
    this.renderScene();
    this.renderTx();

    // Show hint on first load
    if (!S.visitCount) {
      setTimeout(() => {
        this.setData({ hintText: '拖动摇杆控制无人机回中' });
      }, 600);
    }
  },

  restartCountdown() {
    this._stopCountdown();
    this._cdRemain = 0;
    this.setData({ countdownWidth: 100, countdownAnimating: false });
    if (!S.isAdvanced || S.answered) return;
    this._startCountdown(S.timeLimit, S.timeLimit);
  },

  onCountdownTimeout() {
    if (S.answered) return;
    S.answered = true;
    S.total++;
    this._stopCountdown();
    S.correctSX = 0;
    S.correctSY = 0;
    this._showFeedback(false);
    this.updateUI();
    this.saveRound();
    this.showAnswerSolution('timeout');
  },

  setFree() {
    this.setMode(false);
  },

  setAdv() {
    this.setMode(true);
  },

  setMode(advanced) {
    if (S.isAdvanced === advanced) return;
    // 切换模式视为开启新的一轮：先归档旧轮
    this.saveRound();
    S.isAdvanced = advanced;
    this.startRound();
    this.setData({ isAdvanced: advanced });
    if (advanced) {
      this.restartCountdown();
    } else {
      this._stopCountdown();
      this.setData({ countdownAnimating: false, countdownWidth: 100 });
    }
  },

  onResize() {
    const query = wx.createSelectorQuery();
    query.select('#scene').fields({ node: true, size: true });
    query.select('#scene').boundingClientRect();
    query.select('#tx').fields({ node: true, size: true });
    query.select('#tx').boundingClientRect();
    query.exec((res) => {
      if (!res[0] || !res[2]) return;
      this.txRect = { left: res[3].left, top: res[3].top };
      this.sceneRect = { left: res[1].left, top: res[1].top };
      this._sizeSceneCanvas(res[0].width, res[0].height);
      this._sizeTxCanvas(res[2].width, res[2].height);
      this.renderScene();
      this.renderTx();
    });
  },
});
