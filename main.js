/* ═══════════════════════════════════════════════════════════════
   CONFIG
═══════════════════════════════════════════════════════════════ */

const heatColorScale = d3.scaleSequential()
  .domain([0, 25])
  .interpolator(d3.interpolateYlOrRd);

const extraColorScale = d3.scaleDiverging()
  .domain([-5, 0, 25])
  .interpolator(t => d3.interpolateRdBu(1 - t));

const SIZE = 500;
const dLon = 0.625;
const dLat = 0.5;

/* ═══════════════════════════════════════════════════════════════
   PROJECTION
═══════════════════════════════════════════════════════════════ */

function makeProj() {
  return d3.geoAzimuthalEqualArea()
    .rotate([0, -90])
    .clipAngle(35)
    .scale(SIZE * 0.94)
    .translate([SIZE / 2, SIZE / 2]);
}

function normalizeLon(lon) {
  return lon > 180 ? lon - 360 : lon;
}

function cellGeoJSON(d) {
  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [[
        [d.lonNorm - dLon, d.lat - dLat],
        [d.lonNorm + dLon, d.lat - dLat],
        [d.lonNorm + dLon, d.lat + dLat],
        [d.lonNorm - dLon, d.lat + dLat],
        [d.lonNorm - dLon, d.lat - dLat],
      ]]
    }
  };
}

/* ═══════════════════════════════════════════════════════════════
   TOOLTIP
═══════════════════════════════════════════════════════════════ */

const tooltip = d3.select("#tooltip");

/* ═══════════════════════════════════════════════════════════════
   DRAW MAP
═══════════════════════════════════════════════════════════════ */

function drawMap(svgId, colorFn, valueFn, gridData) {
  const svg  = d3.select(`#${svgId}`);
  const proj = makeProj();
  const path = d3.geoPath(proj);

  svg.append("path")
    .datum({ type: "Sphere" })
    .attr("d", path)
    .attr("fill", "#c9dff0")
    .attr("stroke", "#aac5db")
    .attr("stroke-width", 0.5);

  svg.append("path")
    .datum(d3.geoGraticule().step([30, 10])())
    .attr("d", path)
    .attr("fill", "none")
    .attr("stroke", "#b0c8e0")
    .attr("stroke-width", 0.4);

  const cells = svg.selectAll(".cell")
    .data(gridData)
    .join("path")
    .attr("class", "cell")
    .attr("d", d => path(cellGeoJSON(d)))
    .attr("fill", d => colorFn(valueFn(d)))
    .attr("stroke", "none")
    .attr("opacity", 0.9)
    .on("mousemove", (event, d) => {
      tooltip
        .style("opacity", 1)
        .style("left", (event.clientX + 14) + "px")
        .style("top",  (event.clientY - 40) + "px")
        .html(`
          <strong>${d.lat.toFixed(1)}°N, ${d.lon.toFixed(2)}°</strong><br>
          Heat days: <strong>${d.heatDays}</strong><br>
          Extra days: <strong>${d.extraDays > 0 ? "+" : ""}${d.extraDays}</strong>
        `);
    })
    .on("mouseleave", () => tooltip.style("opacity", 0));

  d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
    .then(world => {
      svg.append("path")
        .datum(topojson.mesh(world, world.objects.countries))
        .attr("d", path)
        .attr("fill", "none")
        .attr("stroke", "#1f2937")
        .attr("stroke-width", 0.8);
    }).catch(() => {});

  return cells;
}

/* ═══════════════════════════════════════════════════════════════
   COLORBAR
═══════════════════════════════════════════════════════════════ */

function drawColorbar(canvasId, labelsId, colorFn, domain, ticks) {
  const canvas = document.getElementById(canvasId);
  const W = 400, H = 14;
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  for (let i = 0; i < W; i++) {
    const val = domain[0] + (i / W) * (domain[domain.length - 1] - domain[0]);
    ctx.fillStyle = colorFn(val);
    ctx.fillRect(i, 0, 1, H);
  }

  const labelsDiv = document.getElementById(labelsId);
  const [dMin, dMax] = [domain[0], domain[domain.length - 1]];
  ticks.forEach(t => {
    const lbl = document.createElement("span");
    lbl.textContent = t;
    labelsDiv.appendChild(lbl);
  });
}

/* ═══════════════════════════════════════════════════════════════
   BRUSH HISTOGRAM
═══════════════════════════════════════════════════════════════ */

function drawBrush(svgId, allValues, colorFn, domain, onBrush) {
  const node   = document.getElementById(svgId);
  const W      = node.clientWidth || 520;
  const H      = 90;
  const margin = { l: 38, r: 12, t: 8, b: 28 };
  const iW     = W - margin.l - margin.r;
  const iH     = H - margin.t - margin.b;

  const svg = d3.select(`#${svgId}`)
    .attr("viewBox", `0 0 ${W} ${H}`);

  const xScale = d3.scaleLinear().domain(domain).range([0, iW]);

  const histogram = d3.bin()
    .domain(domain)
    .thresholds(xScale.ticks(24))(allValues);

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(histogram, d => d.length)])
    .range([iH, 0]);

  const g = svg.append("g")
    .attr("transform", `translate(${margin.l},${margin.t})`);

  g.selectAll("rect.hbar")
    .data(histogram)
    .join("rect")
    .attr("class", "hbar")
    .attr("x",      d => xScale(d.x0) + 0.5)
    .attr("width",  d => Math.max(0, xScale(d.x1) - xScale(d.x0) - 0.5))
    .attr("y",      d => yScale(d.length))
    .attr("height", d => iH - yScale(d.length))
    .attr("fill",   d => colorFn((d.x0 + d.x1) / 2))
    .attr("opacity", 0.9);

  g.append("g")
    .attr("transform", `translate(0,${iH})`)
    .call(d3.axisBottom(xScale).ticks(6).tickSize(3))
    .call(ax => ax.select(".domain").attr("stroke", "#d1d5db"))
    .call(ax => ax.selectAll("text").attr("fill", "#6b7280").attr("font-size", 10))
    .call(ax => ax.selectAll("line").attr("stroke", "#d1d5db"));

  const brush = d3.brushX()
    .extent([[0, 0], [iW, iH]])
    .on("brush end", evt => {
      if (!evt.selection) { onBrush(null); return; }
      onBrush(evt.selection.map(xScale.invert));
    });

  const brushG = g.append("g").call(brush);

  brushG.select(".selection")
    .attr("fill", "#2563eb")
    .attr("fill-opacity", 0.18)
    .attr("stroke", "#2563eb")
    .attr("stroke-width", 1);

  return () => brushG.call(brush.move, null);
}

/* ═══════════════════════════════════════════════════════════════
   FILTER STATE + APPLY
═══════════════════════════════════════════════════════════════ */

let heatRange  = null;
let extraRange = null;
let leftCells, rightCells, totalCount;

function applyFilters() {
  let visible = 0;

  [leftCells, rightCells].forEach(cells => {
    cells.each(function(d) {
      const okH = !heatRange  || (d.heatDays  >= heatRange[0]  && d.heatDays  <= heatRange[1]);
      const okE = !extraRange || (d.extraDays >= extraRange[0] && d.extraDays <= extraRange[1]);
      const show = okH && okE;
      if (show) visible++;
      d3.select(this).classed("dimmed", !show).attr("opacity", show ? 0.9 : 0.07);
    });
  });

  visible = Math.round(visible / 2);

  document.getElementById("info-left").innerHTML = heatRange
    ? `Filtering <span>${heatRange[0].toFixed(1)}–${heatRange[1].toFixed(1)}</span> heat days`
    : "Showing all values";

  document.getElementById("info-right").innerHTML = extraRange
    ? `Filtering <span>${extraRange[0].toFixed(1)}–${extraRange[1].toFixed(1)}</span> extra days`
    : "Showing all values";

  document.getElementById("countLabel").textContent =
    `${visible.toLocaleString()} of ${totalCount.toLocaleString()} cells visible`;
}

/* ═══════════════════════════════════════════════════════════════
   INIT — load CSV then wire everything up
═══════════════════════════════════════════════════════════════ */

d3.csv("arctic_data.csv").then(raw => {
  const gridData = raw.map(d => ({
    lat:       +d.lat,
    lon:       +d.lon,
    lonNorm:   normalizeLon(+d.lon),
    heatDays:  +d.heatDays,
    extraDays: +d.extraDays,
  })).filter(d => !isNaN(d.heatDays) && !isNaN(d.extraDays));

  totalCount = gridData.length;

  document.getElementById("loading").style.display = "none";
  document.getElementById("viz").style.display     = "block";

  leftCells  = drawMap("map-left",  heatColorScale,  d => d.heatDays,  gridData);
  rightCells = drawMap("map-right", extraColorScale, d => d.extraDays, gridData);

  drawColorbar("cbar-left",  "cbar-left-labels",  heatColorScale,  [0, 25],  [0, 5, 10, 15, 20, 25]);
  drawColorbar("cbar-right", "cbar-right-labels", extraColorScale, [-5, 25], [-5, 0, 5, 10, 15, 20, 25]);

  const heatExtent  = d3.extent(gridData, d => d.heatDays);
  const extraExtent = d3.extent(gridData, d => d.extraDays);

  const clearLeft  = drawBrush("brush-left",  gridData.map(d => d.heatDays),
    heatColorScale,  heatExtent,  r => { heatRange  = r; applyFilters(); });

  const clearRight = drawBrush("brush-right", gridData.map(d => d.extraDays),
    extraColorScale, extraExtent, r => { extraRange = r; applyFilters(); });

  document.getElementById("resetAll").addEventListener("click", () => {
    heatRange = extraRange = null;
    clearLeft();
    clearRight();
    applyFilters();
  });

  applyFilters();

}).catch(() => {
  document.getElementById("loading").textContent =
    "Could not load arctic_data.csv — make sure it is in the same folder as this HTML file.";
});