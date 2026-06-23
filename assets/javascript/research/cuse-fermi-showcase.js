/*
 * CuSe research-page Fermi-surface showcase.
 * Requires Plotly to be loaded before this file.
 * Data files expected:
 *   /assets/data/research/cuse-alpha-fermi.json
 *   /assets/data/research/cuse-beta-fermi.json
 */
(function () {
  'use strict';

  const HIGH_CONTRAST_BAND_COLORS = [
    '#00D1FF', '#FFB000', '#00E676', '#FF4D6D', '#B388FF', '#FF7A00',
    '#4CC9F0', '#F8F9FA', '#7AE582', '#F15BB5', '#AACC00', '#FF6B35', '#90DBF4'
  ];

  const PHASE_LABEL = {
    alpha: 'α-CuSe',
    beta: 'β-CuSe'
  };

  const DEFAULT_CAMERA = {
    eye: { x: 1.45, y: 1.35, z: 0.95 },
    up: { x: 0, y: 0, z: 1 },
    center: { x: 0, y: 0, z: 0 }
  };

  const DEFAULT_CONFIG = {
    responsive: true,
    displaylogo: false,
    displayModeBar: true,
    scrollZoom: false,
    modeBarButtonsToRemove: [
      'sendDataToCloud', 'select2d', 'lasso2d', 'hoverClosest3d', 'toggleSpikelines'
    ],
    toImageButtonOptions: {
      format: 'png',
      filename: 'cuse-fermi-surface',
      scale: 2
    }
  };

  function axisStyle(range) {
    const axis = {
      visible: false,
      showbackground: false,
      showgrid: false,
      zeroline: false,
      showticklabels: false,
      title: ''
    };

    if (range) {
      axis.range = range;
      axis.autorange = false;
    }

    return axis;
  }

  function baseLayout(title, commonRanges) {
    const scene = {
      bgcolor: 'rgba(0,0,0,0)',
      aspectmode: 'data',
      camera: DEFAULT_CAMERA,
      xaxis: axisStyle(commonRanges?.x),
      yaxis: axisStyle(commonRanges?.y),
      zaxis: axisStyle(commonRanges?.z)
    };

    return {
      title: { text: '', font: { size: 0 } },
      showlegend: false,
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      margin: { l: 0, r: 0, t: 0, b: 0, pad: 0 },
      hoverlabel: {
        bgcolor: '#101820',
        bordercolor: '#FFE066',
        font: { color: '#F7F7F2', size: 12 }
      },
      scene,
      annotations: [],
      updatemenus: []
    };
  }

  function getBandNumber(trace, index) {
    const source = trace.hovertemplate || trace.name || '';
    const match = source.match(/Band\s+(\d+)/i);
    return match ? match[1] : String(index + 1);
  }

  function cloneTrace(trace) {
    return JSON.parse(JSON.stringify(trace));
  }

  function polishTrace(trace, phase, index) {
    const t = cloneTrace(trace);

    if (t.type === 'mesh3d') {
      const band = getBandNumber(t, index);
      const color = HIGH_CONTRAST_BAND_COLORS[index % HIGH_CONTRAST_BAND_COLORS.length];

      t.name = `Band ${band}`;
      t.color = color;
      t.opacity = 0.94;
      t.flatshading = false;
      t.hovertemplate = `${PHASE_LABEL[phase] || phase}<br>Band ${band}<extra></extra>`;
      t.showscale = false;
      t.legendgroup = phase;

      // Perceived smoothness: keep true mesh geometry but use softer lighting.
      // Do not invent interpolated Fermi-surface geometry here.
      t.lighting = {
        ambient: 0.42,
        diffuse: 0.82,
        specular: 0.28,
        roughness: 0.58,
        fresnel: 0.10
      };
      t.lightposition = { x: 120, y: 180, z: 260 };

      // Remove alternate map traces or colorbars if any survived extraction.
      delete t.intensity;
      delete t.colorscale;
      delete t.colorbar;
      delete t.cmin;
      delete t.cmax;
    }

    if (t.type === 'scatter3d') {
      t.hoverinfo = 'skip';
      t.showlegend = false;
      t.line = Object.assign({}, t.line || {}, {
        color: 'rgba(255,255,255,0.35)',
        width: 2
      });
    }

    return t;
  }

  async function loadFermiData(url) {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) {
      throw new Error(`Could not load ${url}: ${response.status}`);
    }
    return response.json();
  }

  function decodeTypedArray(attribute) {
    if (!attribute || typeof attribute.bdata !== 'string' || typeof window.atob !== 'function') {
      return [];
    }

    const binary = window.atob(attribute.bdata);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    const view = new DataView(bytes.buffer);
    const dtype = String(attribute.dtype || '').replace(/[<>|]/g, '');
    const readers = {
      f8: { size: 8, read: (offset) => view.getFloat64(offset, true) },
      f4: { size: 4, read: (offset) => view.getFloat32(offset, true) },
      i4: { size: 4, read: (offset) => view.getInt32(offset, true) },
      u4: { size: 4, read: (offset) => view.getUint32(offset, true) },
      i2: { size: 2, read: (offset) => view.getInt16(offset, true) },
      u2: { size: 2, read: (offset) => view.getUint16(offset, true) },
      i1: { size: 1, read: (offset) => view.getInt8(offset) },
      u1: { size: 1, read: (offset) => view.getUint8(offset) }
    };
    const reader = readers[dtype];
    if (!reader) return [];

    const values = [];
    for (let offset = 0; offset <= bytes.byteLength - reader.size; offset += reader.size) {
      values.push(reader.read(offset));
    }
    return values;
  }

  function collectNumbers(value, numbers) {
    if (Array.isArray(value)) {
      value.forEach((item) => collectNumbers(item, numbers));
      return;
    }

    if (value && typeof value === 'object' && typeof value.bdata === 'string') {
      decodeTypedArray(value).forEach((number) => {
        if (Number.isFinite(number)) numbers.push(number);
      });
      return;
    }

    const number = Number(value);
    if (Number.isFinite(number)) {
      numbers.push(number);
    }
  }

  function collectPayloadNumbers(payloads, coordinate) {
    const numbers = [];
    payloads.forEach((payload) => {
      (payload.data || []).forEach((trace) => {
        collectNumbers(trace[coordinate], numbers);
      });
    });
    return numbers;
  }

  function symmetricRange(values, padding = 0.04) {
    const maxAbs = values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    if (!maxAbs) return null;
    const limit = maxAbs * (1 + padding);
    return [-limit, limit];
  }

  function computeCommonRanges(payloads) {
    const xRange = symmetricRange(collectPayloadNumbers(payloads, 'x'), 0.04);
    const yRange = symmetricRange(collectPayloadNumbers(payloads, 'y'), 0.04);
    const zRange = symmetricRange(collectPayloadNumbers(payloads, 'z'), 0.04);

    if (!xRange || !yRange || !zRange) return null;

    return {
      x: xRange,
      y: yRange,
      z: zRange
    };
  }

  function setStatus(element, text, isError) {
    const status = element.closest('.cuse-fermi-card')?.querySelector('.cuse-fermi-status');
    if (status) {
      status.textContent = text;
      status.hidden = !text;
      status.classList.toggle('is-error', Boolean(isError));
    }
  }

  function playStructureVideos(showcase) {
    showcase.querySelectorAll('[data-cuse-autoplay-video]').forEach((video) => {
      video.muted = true;
      video.loop = true;
      video.playsInline = true;

      const play = () => {
        const attempt = video.play();
        if (attempt && typeof attempt.catch === 'function') {
          attempt.catch(() => {});
        }
      };

      if (video.readyState >= 2) {
        play();
      } else {
        video.addEventListener('canplay', play, { once: true });
      }
    });
  }

  async function renderPlot(element, payload, commonRanges) {
    const phase = element.dataset.phase;
    const traces = (payload.data || []).map((trace, index) => polishTrace(trace, phase, index));

    await Plotly.newPlot(element, traces, baseLayout(PHASE_LABEL[phase], commonRanges), DEFAULT_CONFIG);
    setStatus(element, '', false);
    return element;
  }

  function synchronizeCameras(plots) {
    let syncing = false;
    plots.forEach((plot) => {
      plot.on('plotly_relayout', (eventData) => {
        if (syncing || !eventData || !eventData['scene.camera']) return;
        syncing = true;
        const updates = { 'scene.camera': eventData['scene.camera'] };
        Promise.all(
          plots.filter((other) => other !== plot).map((other) => Plotly.relayout(other, updates))
        ).finally(() => {
          syncing = false;
        });
      });
    });
  }

  async function initShowcase(showcase) {
    playStructureVideos(showcase);

    if (!window.Plotly) {
      showcase.classList.add('is-error');
      const message = showcase.querySelector('.cuse-showcase-error');
      if (message) message.hidden = false;
      return;
    }

    const plotElements = Array.from(showcase.querySelectorAll('.cuse-fermi-plot'));
    const loadedPlots = [];
    const rendered = [];

    for (const element of plotElements) {
      try {
        const src = element.dataset.src;
        if (!src) {
          throw new Error(`Missing data-src on #${element.id}`);
        }
        setStatus(element, 'Loading Fermi surface...', false);
        loadedPlots.push({
          element,
          payload: await loadFermiData(src)
        });
      } catch (error) {
        console.error(error);
        setStatus(element, 'Could not load interactive surface.', true);
      }
    }

    const commonRanges = computeCommonRanges(loadedPlots.map((plot) => plot.payload));

    for (const plot of loadedPlots) {
      try {
        rendered.push(await renderPlot(plot.element, plot.payload, commonRanges));
      } catch (error) {
        console.error(error);
        setStatus(plot.element, 'Could not render interactive surface.', true);
      }
    }

    if (rendered.length > 1 && showcase.dataset.syncCameras !== 'false') {
      synchronizeCameras(rendered);
    }

    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(() => {
        rendered.forEach((plot) => Plotly.Plots.resize(plot));
      });
      observer.observe(showcase);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-cuse-showcase]').forEach(initShowcase);
  });
}());
