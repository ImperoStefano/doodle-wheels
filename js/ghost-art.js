// The replay uses open wheel outlines so the terrain stays visible through it.
const RaceGhostArt = (() => {
  const turn = 2 * Math.PI;

  function wheel(c, x, y, radius, angle) {
    const gap = 0.14;
    for (let i = 0; i < 3; i++) {
      const start = angle + turn * i / 3 + gap;
      c.moveTo(x + radius * Math.cos(start), y + radius * Math.sin(start));
      c.arc(x, y, radius, start, angle + turn * (i + 1) / 3 - gap);
    }
    // A short rotating spoke makes rolling visible even at small screen scales.
    c.moveTo(x, y);
    c.lineTo(x + radius * 0.56 * Math.cos(angle), y + radius * 0.56 * Math.sin(angle));
  }

  function draw(c, pose, camX, groundY, baseGroundY, viewWidth = Infinity) {
    if (!pose) return;
    const scale = pose.sc || 1, radius = 80 * scale;
    const fx = pose.fwX - camX, rx = pose.rwX - camX;
    const margin = 126 * scale;
    if (Math.max(rx, fx, pose.x - camX) < -margin ||
        Math.min(rx, fx, pose.x - camX) > viewWidth + margin) return;

    const dy = groundY - baseGroundY;
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    wheel(c, rx, pose.rwY + dy, radius, pose.rwAngle || 0);
    wheel(c, fx, pose.fwY + dy, radius, pose.fwAngle || 0);

    // Frame points use the recorded chassis transform. The fork and chainstay
    // meet the measured hubs even while the axle constraints are flexing.
    c.moveTo(rx, pose.rwY + dy);
    c.save();
    c.translate(pose.x - camX, pose.y + dy);
    c.rotate(pose.angle); c.scale(scale, scale);
    c.lineTo(-20, -55); c.lineTo(0, 0); c.closePath();
    c.moveTo(0, 0); c.lineTo(55, -45); c.lineTo(-20, -55);
    c.lineTo(-26, -76); c.moveTo(-37, -76); c.lineTo(-15, -76);
    c.moveTo(60, -80); c.lineTo(45, -70); c.lineTo(55, -45);
    c.restore();
    c.lineTo(fx, pose.fwY + dy);

    c.strokeStyle = 'rgba(27,65,86,.52)'; c.lineWidth = 7; c.stroke();
    c.strokeStyle = 'rgba(192,255,239,.78)'; c.lineWidth = 3.5; c.stroke();
    c.restore();
  }

  return {draw};
})();
