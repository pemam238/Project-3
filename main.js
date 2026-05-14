const SIZE = 500;
const CELL_SIZE = 4;
const CELL_PAD = CELL_SIZE * 0.08;

let gridData = [];
let cells;
let currentMetric = "heatDays";
let currentRange = null;
let clearBrushFn = null;

const tooltip = d3.select("#tooltip");

const metricConfig = {
  heatDays: {
    label: "Extreme heat days",
    colorbarTitle: "Extreme heat days",
    bins: [0, 1, 5, 10, 15, 20, 25, Infinity],
    colors: [
      "#fff200",
      "#ffd000",
      "#ffb300",
      "#ff7b00",
      "#ff3b00",
      "#e00000",
      "#8b0000"
    ]
  },

  extraDays: {
    label: "Extra days beyond baseline",
    colorbarTitle: "Extra days beyond baseline",
    bins: [-Infinity, -5, 0, 5, 10, 15, 20, Infinity],
    colors: [
      "#fff7bc",
      "#fee391",
      "#fec44f",
      "#fe9929",
      "#ec7014",
      "#cc4c02",
      "#990000"
    ]
  }
};

function getColorScale(metric) {
  const config = metricConfig[metric];

  return d3.scaleThreshold()
    .domain(config.bins.slice(1, -1))
    .range(config.colors);
}

function normalizeLon(lon) {
  return lon > 180 ? lon - 360 : lon;
}

function aggregateByGrid(data) {
  const cleaned = data.map(d => ({
    lat: +d.lat,
    lon: +d.lon,
    lonNorm: normalizeLon(+d.lon),
    heatDays: +d.heatDays,
    extraDays: +d.extraDays
  })).filter(d =>
    !isNaN(d.lat) &&
    !isNaN(d.lonNorm) &&
    !isNaN(d.heatDays) &&
    !isNaN(d.extraDays) &&
    d.lat >= 55
  );

  const grouped = d3.rollups(
    cleaned,
    v => {
      const latBin = Math.floor(d3.mean(v, d => d.lat) / CELL_SIZE) * CELL_SIZE;
      const lonBin = Math.floor(d3.mean(v, d => d.lonNorm) / CELL_SIZE) * CELL_SIZE;

      return {
        lat: latBin + CELL_SIZE / 2,
        lon: lonBin + CELL_SIZE / 2,
        lonNorm: lonBin + CELL_SIZE / 2,
        latBin,
        lonBin,
        heatDays: d3.mean(v, d => d.heatDays),
        extraDays: d3.mean(v, d => d.extraDays),
        count: v.length
      };
    },
    d => Math.floor(d.lat / CELL_SIZE) * CELL_SIZE,
    d => Math.floor(d.lonNorm / CELL_SIZE) * CELL_SIZE
  );

  return grouped.flatMap(([latBin, lonGroups]) =>
    lonGroups.map(([lonBin, values]) => values)
  );
}

function makeProjection() {
  return d3.geoAzimuthalEqualArea()
    .rotate([0, -90])
    .clipAngle(35)
    .scale(SIZE * 0.94)
    .translate([SIZE / 2, SIZE / 2]);
}

function drawMap() {
  const svg = d3.select("#map");
  const proj = makeProjection();
  const path = d3.geoPath(proj);

  svg.selectAll("*").remove();

  svg.append("defs").append("clipPath")
  .attr("id", "sphere-clip")
  .append("circle")
  .attr("cx", SIZE / 2)
  .attr("cy", SIZE / 2)
  .attr("r", SIZE * 0.49);

 svg.append("path")
  .datum({ type: "Sphere" })
  .attr("d", path)
  .attr("fill", "none")
  .attr("stroke", "none");

  svg.append("path")
    .datum(d3.geoGraticule().step([30, 10])())
    .attr("d", path)
    .attr("fill", "none")
    .attr("stroke", "#a6a8a7")
    .attr("stroke-width", 0.5)
    .attr("opacity", 0.45)
    .attr("clip-path", "url(#sphere-clip)");
  

    d3.json("world.geojson")
    .then(world => {
      // draw heat polygons first
      drawCells(svg, proj);
      svg.select(".cells-layer").attr("clip-path", "url(#sphere-clip)");  

    // overlay for land (remove if not wanted)
    svg.append("path")
      .datum(world)
      .attr("d", path)
      .attr("fill", "rgba(100, 97, 97, 0.18)")
      .attr("stroke", "none")
      .style("pointer-events", "none")
      .attr("clip-path", "url(#sphere-clip)");

  
      // white halo behind coastline
      svg.append("path")
        .datum(world)
        .attr("d", path)
        .attr("fill", "none")
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 4.5)
        .attr("stroke-opacity", 0.95)
        .style("pointer-events", "none")
        .attr("clip-path", "url(#sphere-clip)");
  
      // black coastline on top
      svg.append("path")
        .datum(world)
        .attr("d", path)
        .attr("fill", "none")
        .attr("stroke", "#000000")
        .attr("stroke-width", 2)
        .attr("stroke-opacity", 1)
        .style("pointer-events", "none")
        .attr("clip-path", "url(#sphere-clip)");

      const latLabels = [62, 72, 82];
      latLabels.forEach(lat => {
        [0, 180].forEach(lon => {
          const pt = proj([lon, lat]);
          if (!pt) return;
          svg.append("text")
            .attr("x", pt[0])
            .attr("y", pt[1] - 3)
            .attr("font-size", 9)
            .attr("fill", "#333")
            .attr("text-anchor", "middle")
            .attr("paint-order", "stroke")
            .attr("stroke", "white")
            .attr("stroke-width", 3)
            .attr("stroke-linejoin", "round")
            .text(`${lat}°N`);
        });
      });

      // Longitude spoke labels — projected just outside the circle boundary
      const lonLabels = d3.range(-180, 180, 30);
      const cx = SIZE / 2;
      const cy = SIZE / 2;
      const r = SIZE * 0.49;

      lonLabels.forEach(lon => {
        const pt = proj([lon, 55]);
        if (!pt) return;

        // compute direction from center and push label outside the circle
        const dx = pt[0] - cx;
        const dy = pt[1] - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const scale = (r + 14) / dist;

        svg.append("text")
          .attr("x", cx + dx * scale)
          .attr("y", cy + dy * scale)
          .attr("font-size", 9)
          .attr("fill", "#333")
          .attr("text-anchor", "middle")
          .attr("alignment-baseline", "middle")
          .text(`${lon}°`);
        });

    });
}

function drawCells(svg, proj) {
  const path = d3.geoPath(proj);

  const cellPolygons = gridData.map(d => {
    const lat0 = d.latBin - CELL_PAD;
    const lat1 = Math.min(d.latBin + CELL_SIZE + CELL_PAD, 89.5);
    const lon0 = d.lonBin - CELL_PAD;
    const lon1 = d.lonBin + CELL_SIZE + CELL_PAD;

    return {
      ...d,
      geometry: {
        type: "Polygon",
        coordinates: [[
          [lon0, lat0],
          [lon0, lat1],
          [lon1, lat1],
          [lon1, lat0],
          [lon0, lat0]
        ]]
      }
    };
  });

  cells = svg.append("g")
    .attr("class", "cells-layer")
    .selectAll(".cell")
    .data(cellPolygons)
    .join("path")
    .attr("class", "cell")
    .attr("d", d => path(d.geometry))
    .attr("stroke", "none")
    .attr("opacity", 0.72)
    .on("mousemove", (event, d) => {
      tooltip
        .style("opacity", 1)
        .style("left", `${event.clientX + 14}px`)
        .style("top", `${event.clientY - 40}px`)
        .html(`
          <strong>${d.lat.toFixed(1)}°N, ${d.lonNorm.toFixed(1)}°</strong><br>
          Heat days: <strong>${d.heatDays.toFixed(1)}</strong><br>
          Extra days: <strong>${d.extraDays > 0 ? "+" : ""}${d.extraDays.toFixed(1)}</strong><br>
          Original points: <strong>${d.count}</strong>
        `);
    })
    .on("mouseleave", () => tooltip.style("opacity", 0));

  updateMapColors();
}

function updateMapColors() {
  if (!cells) return;

  const colorScale = getColorScale(currentMetric);
  cells.attr("fill", d => colorScale(d[currentMetric]));
  applyFilter();
}

function drawColorbar() {
  const config = metricConfig[currentMetric];
  const legend = d3.select("#colorbarLegend");

  legend.selectAll("*").remove();

  const rows = legend.selectAll(".legend-item")
    .data(config.colors)
    .join("div")
    .attr("class", "legend-item");

  rows.append("span")
    .attr("class", "legend-swatch")
    .style("background", d => d);

  rows.append("span")
    .text((d, i) => {
      const lo = config.bins[i];
      const hi = config.bins[i + 1];

      if (lo === -Infinity) return `< ${hi}`;
      if (hi === Infinity) return `${lo}+`;
      return `${lo}–${hi}`;
    });

  document.getElementById("colorbarTitle").textContent = config.colorbarTitle;
}

function drawBrush() {
  const config = metricConfig[currentMetric];
  const colorScale = getColorScale(currentMetric);
  const values = gridData.map(d => d[currentMetric]);

  const svg = d3.select("#brush");
  svg.selectAll("*").remove();

  const node = document.getElementById("brush");
  const W = node.clientWidth || 700;
  const H = 95;
  const margin = { l: 42, r: 16, t: 10, b: 30 };
  const iW = W - margin.l - margin.r;
  const iH = H - margin.t - margin.b;

  svg.attr("viewBox", `0 0 ${W} ${H}`);

  const extent = d3.extent(values);

  const xScale = d3.scaleLinear()
    .domain(extent)
    .nice()
    .range([0, iW]);

  const bins = d3.bin()
    .domain(xScale.domain())
    .thresholds(xScale.ticks(24))(values);

  // const yScale = d3.scaleLinear()
  //   .domain([0, d3.max(bins, d => d.length)])
  //   .nice()
  //   .range([iH, 0]);

  // make it show better by using sqrt scaling
  const yScale = d3.scaleSqrt()
  .domain([0, d3.max(bins, d => d.length)])
  .range([iH, 0]);

  const g = svg.append("g")
    .attr("transform", `translate(${margin.l},${margin.t})`);

  g.selectAll("rect")
    .data(bins)
    .join("rect")
    .attr("x", d => xScale(d.x0) + 0.5)
    .attr("width", d => Math.max(0, xScale(d.x1) - xScale(d.x0) - 0.5))
    .attr("y", d => yScale(d.length))
    .attr("height", d => iH - yScale(d.length))
    .attr("fill", d => colorScale((d.x0 + d.x1) / 2))
    .attr("opacity", 0.9);

  g.append("g")
    .attr("transform", `translate(0,${iH})`)
    .call(d3.axisBottom(xScale).ticks(6).tickSize(3))
    .call(ax => ax.select(".domain").attr("stroke", "#d1d5db"))
    .call(ax => ax.selectAll("text").attr("fill", "#6b7280").attr("font-size", 10))
    .call(ax => ax.selectAll("line").attr("stroke", "#d1d5db"));

  const brush = d3.brushX()
    .extent([[0, 0], [iW, iH]])
    .on("brush end", event => {
      if (!event.selection) {
        currentRange = null;
      } else {
        currentRange = event.selection.map(xScale.invert);
      }

      applyFilter();
    });

  const brushG = g.append("g")
    .call(brush);

  brushG.select(".selection")
    .attr("fill", "#2563eb")
    .attr("fill-opacity", 0.18)
    .attr("stroke", "#2563eb")
    .attr("stroke-width", 1);

  clearBrushFn = () => brushG.call(brush.move, null);
}

function applyFilter() {
  if (!cells) return;

  let visible = 0;

  cells.each(function(d) {
    const value = d[currentMetric];

    const show = !currentRange ||
      (value >= currentRange[0] && value <= currentRange[1]);

    if (show) visible++;

    d3.select(this)
      .classed("dimmed", !show)
      .attr("opacity", show ? 0.72 : 0.02);
  });

  document.getElementById("countLabel").textContent =
    `${visible.toLocaleString()} of ${gridData.length.toLocaleString()} aggregated cells visible`;

  document.getElementById("brushInfo").innerHTML = currentRange
    ? `Filtering <span>${currentRange[0].toFixed(1)}–${currentRange[1].toFixed(1)}</span> ${metricConfig[currentMetric].label}`
    : "Showing all values";
}

function updateMetric() {
  currentMetric = document.getElementById("metricSelect").value;
  currentRange = null;

  updateMapColors();
  drawColorbar();
  drawBrush();
  applyFilter();
}

d3.csv("arctic_data.csv").then(raw => {
  gridData = aggregateByGrid(raw);

  document.getElementById("loading").style.display = "none";
  document.getElementById("viz").style.display = "block";

  drawMap();
  drawColorbar();
  drawBrush();
  applyFilter();

  document.getElementById("metricSelect").addEventListener("change", updateMetric);

  document.getElementById("resetFilter").addEventListener("click", () => {
    currentRange = null;
    if (clearBrushFn) clearBrushFn();
    applyFilter();
  });

}).catch(error => {
  console.error(error);
  document.getElementById("loading").textContent =
    "Could not load arctic_data.csv — make sure it is in the same folder as index.html.";
});