(function () {
    'use strict';

    const state = {
        canvas: null,
        gl: null,
        program: null,
        buffers: null,
        locations: null,
        indexCount: 0,
        ready: false,
        visible: false,
        total: 0,
        yaw: -0.34,
        tilt: -0.18,
        animationStart: 0,
        animationFrame: 0,
        animating: false,
        pointer: null,
        resizeBound: false
    };

    const vertexSource = [
        'attribute vec3 aPosition;',
        'attribute vec3 aNormal;',
        'uniform mat4 uProjection;',
        'uniform vec3 uOffset;',
        'uniform float uScale;',
        'uniform float uYaw;',
        'uniform float uTilt;',
        'uniform float uSeed;',
        'varying vec3 vNormal;',
        'varying vec3 vLocal;',
        'vec3 rotateX(vec3 p, float a) {',
        '  float c = cos(a), s = sin(a);',
        '  return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);',
        '}',
        'vec3 rotateY(vec3 p, float a) {',
        '  float c = cos(a), s = sin(a);',
        '  return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);',
        '}',
        'void main() {',
        '  float longitude = atan(aPosition.z, aPosition.x);',
        '  float individual = sin(aPosition.y * 6.7 + longitude * 3.0 + uSeed) * 0.018;',
        '  vec3 shaped = vec3(aPosition.x * (1.0 + individual), aPosition.y * (1.0 + individual * 0.35), aPosition.z * (1.0 + individual));',
        '  vec3 turned = rotateY(rotateX(shaped, uTilt), uYaw);',
        '  vec3 world = turned * uScale + uOffset;',
        '  world.z -= 9.5;',
        '  vNormal = normalize(rotateY(rotateX(aNormal, uTilt), uYaw));',
        '  vLocal = shaped;',
        '  gl_Position = uProjection * vec4(world, 1.0);',
        '}'
    ].join('\n');

    const fragmentSource = [
        'precision mediump float;',
        'uniform float uActive;',
        'uniform float uSeed;',
        'varying vec3 vNormal;',
        'varying vec3 vLocal;',
        'float hash(vec3 p) {',
        '  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719)) + uSeed) * 43758.5453);',
        '}',
        'void main() {',
        '  vec3 n = normalize(vNormal);',
        '  vec3 lightDir = normalize(vec3(-0.55, 0.78, 0.72));',
        '  float diffuse = max(dot(n, lightDir), 0.0);',
        '  float backLight = max(dot(n, normalize(vec3(0.7, -0.3, 0.45))), 0.0);',
        '  float rim = pow(1.0 - max(n.z, 0.0), 2.4);',
        '  float longitude = atan(vLocal.z, vLocal.x);',
        '  float latitude = atan(vLocal.y, length(vLocal.xz));',
        '  float furrowPath = longitude * 5.0 + sin(latitude * 3.0) * 0.13;',
        '  float groove = pow(0.5 + 0.5 * cos(furrowPath), 15.0);',
        '  float wrinkle = pow(abs(sin(latitude * 17.0 + longitude * 7.0 + uSeed * 0.04)), 7.0);',
        '  float pore = hash(floor(vLocal * 23.0));',
        '  float seedTone = 0.5 + 0.5 * sin(uSeed * 0.17);',
        '  float bore = (1.0 - smoothstep(0.08, 0.30, length(vLocal.xz))) * smoothstep(0.64, 0.82, abs(vLocal.y));',
        '  vec3 deepBrown = vec3(0.075, 0.018, 0.006);',
        '  vec3 barkBrown = mix(vec3(0.31, 0.082, 0.020), vec3(0.47, 0.17, 0.052), seedTone * 0.46);',
        '  vec3 color = mix(deepBrown, barkBrown, 0.48 + diffuse * 0.52);',
        '  color *= 1.0 - groove * 0.70;',
        '  color *= 1.0 - bore * 0.68;',
        '  color *= 1.0 - wrinkle * (0.08 + pore * 0.08);',
        '  color *= 0.88 + pore * 0.18;',
        '  color += vec3(0.30, 0.14, 0.035) * backLight * 0.11;',
        '  color += vec3(0.34, 0.16, 0.035) * rim * 0.15;',
        '  color += vec3(0.36, 0.19, 0.055) * uActive * (0.18 + diffuse * 0.16);',
        '  float specular = pow(max(dot(reflect(-lightDir, n), vec3(0.0, 0.0, 1.0)), 0.0), 34.0);',
        '  color += vec3(0.92, 0.58, 0.24) * specular * (0.07 + uActive * 0.10);',
        '  gl_FragColor = vec4(color, 1.0);',
        '}'
    ].join('\n');

    function compileShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const message = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(message || 'Unable to compile the 3D mala shader.');
        }
        return shader;
    }

    function createProgram(gl) {
        const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
        const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
        const program = gl.createProgram();
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const message = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            throw new Error(message || 'Unable to link the 3D mala shaders.');
        }
        return program;
    }

    function createRudrakshaGeometry() {
        const longitudeSegments = 52;
        const latitudeSegments = 28;
        const positions = [];
        const indices = [];

        for (let latIndex = 0; latIndex <= latitudeSegments; latIndex++) {
            const latitude = -1.5 + (latIndex / latitudeSegments) * 3.0;
            const latitudeCos = Math.max(0, Math.cos(latitude));
            const vertical = Math.sin(latitude) * 0.99 + Math.sin(latitude * 2) * 0.035;
            const bodyRing = 0.125 + Math.pow(latitudeCos, 0.82) * 0.875;
            const middleWeight = Math.pow(latitudeCos, 0.55);
            for (let lonIndex = 0; lonIndex <= longitudeSegments; lonIndex++) {
                const longitude = (lonIndex / longitudeSegments) * Math.PI * 2;
                const furrowPath = longitude * 5 + Math.sin(latitude * 3) * 0.13;
                const cleft = Math.pow((1 + Math.cos(furrowPath)) * 0.5, 15);
                const faceBulge = (1 - Math.cos(furrowPath)) * 0.5;
                const tubercleA = Math.sin(longitude * 13 + latitude * 19);
                const tubercleB = Math.sin(longitude * 21 - latitude * 11);
                const tubercles = Math.max(0, tubercleA * tubercleB) * 0.045 * middleWeight;
                const fineRoughness = (
                    Math.sin(longitude * 29 + latitude * 23)
                    + Math.sin(longitude * 17 - latitude * 31)
                ) * 0.0075 * middleWeight;
                const asymmetry = 1
                    + Math.sin(longitude * 2 + 0.7) * 0.028
                    + Math.cos(longitude * 3 - latitude * 1.4) * 0.018;
                const ring = bodyRing
                    * (1 - cleft * 0.27 + faceBulge * 0.052)
                    * asymmetry
                    + tubercles
                    + fineRoughness;
                positions.push(
                    ring * Math.cos(longitude),
                    vertical + Math.sin(furrowPath) * latitudeCos * 0.018,
                    ring * Math.sin(longitude)
                );
            }
        }

        const row = longitudeSegments + 1;
        for (let latIndex = 0; latIndex < latitudeSegments; latIndex++) {
            for (let lonIndex = 0; lonIndex < longitudeSegments; lonIndex++) {
                const a = latIndex * row + lonIndex;
                const b = a + row;
                indices.push(a, b, a + 1, b, b + 1, a + 1);
            }
        }

        // Recessed pole-to-pole channel: taper each irregular outer rim into a
        // darker inner ring so the silk thread visibly passes through the seed.
        const topOuterStart = latitudeSegments * row;
        const bottomOuterStart = 0;
        const topInnerStart = positions.length / 3;
        for (let lonIndex = 0; lonIndex <= longitudeSegments; lonIndex++) {
            const longitude = (lonIndex / longitudeSegments) * Math.PI * 2;
            const innerRadius = 0.082 + Math.sin(longitude * 7) * 0.006;
            positions.push(innerRadius * Math.cos(longitude), 0.76, innerRadius * Math.sin(longitude));
        }
        const bottomInnerStart = positions.length / 3;
        for (let lonIndex = 0; lonIndex <= longitudeSegments; lonIndex++) {
            const longitude = (lonIndex / longitudeSegments) * Math.PI * 2;
            const innerRadius = 0.082 + Math.cos(longitude * 9) * 0.006;
            positions.push(innerRadius * Math.cos(longitude), -0.76, innerRadius * Math.sin(longitude));
        }
        for (let lonIndex = 0; lonIndex < longitudeSegments; lonIndex++) {
            const topOuter = topOuterStart + lonIndex;
            const topInner = topInnerStart + lonIndex;
            indices.push(topOuter, topInner, topOuter + 1, topOuter + 1, topInner, topInner + 1);

            const bottomOuter = bottomOuterStart + lonIndex;
            const bottomInner = bottomInnerStart + lonIndex;
            indices.push(bottomOuter, bottomOuter + 1, bottomInner, bottomOuter + 1, bottomInner + 1, bottomInner);
        }

        const normals = new Float32Array(positions.length);
        for (let i = 0; i < indices.length; i += 3) {
            const ia = indices[i] * 3;
            const ib = indices[i + 1] * 3;
            const ic = indices[i + 2] * 3;
            const abx = positions[ib] - positions[ia];
            const aby = positions[ib + 1] - positions[ia + 1];
            const abz = positions[ib + 2] - positions[ia + 2];
            const acx = positions[ic] - positions[ia];
            const acy = positions[ic + 1] - positions[ia + 1];
            const acz = positions[ic + 2] - positions[ia + 2];
            const nx = aby * acz - abz * acy;
            const ny = abz * acx - abx * acz;
            const nz = abx * acy - aby * acx;
            for (const offset of [ia, ib, ic]) {
                normals[offset] += nx;
                normals[offset + 1] += ny;
                normals[offset + 2] += nz;
            }
        }
        for (let i = 0; i < normals.length; i += 3) {
            const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
            normals[i] /= length;
            normals[i + 1] /= length;
            normals[i + 2] /= length;
        }

        return {
            positions: new Float32Array(positions),
            normals: normals,
            indices: new Uint16Array(indices)
        };
    }

    function createBuffer(gl, target, data) {
        const buffer = gl.createBuffer();
        gl.bindBuffer(target, buffer);
        gl.bufferData(target, data, gl.STATIC_DRAW);
        return buffer;
    }

    function perspective(fieldOfView, aspect, near, far) {
        const f = 1 / Math.tan(fieldOfView / 2);
        const range = 1 / (near - far);
        return new Float32Array([
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (near + far) * range, -1,
            0, 0, near * far * range * 2, 0
        ]);
    }

    function showFallback() {
        const fallback = document.getElementById('jmRudrakshaFallback');
        if (state.canvas) state.canvas.hidden = true;
        if (fallback) fallback.hidden = false;
    }

    function hideFallback() {
        const fallback = document.getElementById('jmRudrakshaFallback');
        if (state.canvas) state.canvas.hidden = false;
        if (fallback) fallback.hidden = true;
    }

    function bindPointerControls() {
        const canvas = state.canvas;
        canvas.addEventListener('pointerdown', function (event) {
            event.stopPropagation();
            state.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw: state.yaw, tilt: state.tilt, moved: false };
            canvas.setPointerCapture(event.pointerId);
        });
        canvas.addEventListener('pointermove', function (event) {
            if (!state.pointer || state.pointer.id !== event.pointerId) return;
            event.stopPropagation();
            const dx = event.clientX - state.pointer.x;
            const dy = event.clientY - state.pointer.y;
            if (Math.hypot(dx, dy) > 7) state.pointer.moved = true;
            state.yaw = state.pointer.yaw + dx * 0.012;
            state.tilt = Math.max(-0.65, Math.min(0.4, state.pointer.tilt + dy * 0.004));
            render(0);
        });
        canvas.addEventListener('pointerup', function (event) {
            if (!state.pointer || state.pointer.id !== event.pointerId) return;
            event.stopPropagation();
            const wasTap = !state.pointer.moved;
            state.pointer = null;
            if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
            if (wasTap && typeof window.bumpJapa === 'function') window.bumpJapa();
        });
        canvas.addEventListener('pointercancel', function (event) {
            event.stopPropagation();
            state.pointer = null;
        });
        canvas.addEventListener('click', function (event) {
            event.stopPropagation();
        });
        canvas.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            event.stopPropagation();
            if (typeof window.bumpJapa === 'function') window.bumpJapa();
        });
    }

    function ensureReady() {
        if (state.ready) return true;
        state.canvas = document.getElementById('jmRudrakshaCanvas');
        if (!state.canvas) return false;
        try {
            const gl = state.canvas.getContext('webgl', {
                alpha: true,
                antialias: true,
                depth: true,
                powerPreference: 'low-power',
                preserveDrawingBuffer: false
            });
            if (!gl) {
                showFallback();
                return false;
            }

            state.gl = gl;
            state.program = createProgram(gl);
            const geometry = createRudrakshaGeometry();
            state.buffers = {
                position: createBuffer(gl, gl.ARRAY_BUFFER, geometry.positions),
                normal: createBuffer(gl, gl.ARRAY_BUFFER, geometry.normals),
                index: createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, geometry.indices)
            };
            state.indexCount = geometry.indices.length;
            state.locations = {
                position: gl.getAttribLocation(state.program, 'aPosition'),
                normal: gl.getAttribLocation(state.program, 'aNormal'),
                projection: gl.getUniformLocation(state.program, 'uProjection'),
                offset: gl.getUniformLocation(state.program, 'uOffset'),
                scale: gl.getUniformLocation(state.program, 'uScale'),
                yaw: gl.getUniformLocation(state.program, 'uYaw'),
                tilt: gl.getUniformLocation(state.program, 'uTilt'),
                active: gl.getUniformLocation(state.program, 'uActive'),
                seed: gl.getUniformLocation(state.program, 'uSeed')
            };

            gl.useProgram(state.program);
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);
            gl.enable(gl.CULL_FACE);
            gl.cullFace(gl.BACK);
            gl.clearColor(0, 0, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, state.buffers.position);
            gl.enableVertexAttribArray(state.locations.position);
            gl.vertexAttribPointer(state.locations.position, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, state.buffers.normal);
            gl.enableVertexAttribArray(state.locations.normal);
            gl.vertexAttribPointer(state.locations.normal, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, state.buffers.index);

            if (!state.canvas.dataset.jm3dBound) {
                bindPointerControls();
                state.canvas.addEventListener('webglcontextlost', function (event) {
                    event.preventDefault();
                    state.ready = false;
                    cancelAnimationFrame(state.animationFrame);
                    showFallback();
                });
                state.canvas.addEventListener('webglcontextrestored', function () {
                    state.ready = false;
                    ensureReady();
                    hideFallback();
                    render(0);
                });
                state.canvas.dataset.jm3dBound = '1';
            }
            if (!state.resizeBound) {
                window.addEventListener('resize', function () {
                    if (state.visible) render(0);
                }, { passive: true });
                state.resizeBound = true;
            }
            state.ready = true;
            hideFallback();
            return true;
        } catch (error) {
            console.warn('3D Rudraksha unavailable:', error);
            showFallback();
            return false;
        }
    }

    function resizeCanvas() {
        const canvas = state.canvas;
        const gl = state.gl;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
        const width = Math.max(1, Math.round(rect.width * pixelRatio));
        const height = Math.max(1, Math.round(rect.height * pixelRatio));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        gl.viewport(0, 0, width, height);
        return true;
    }

    function render(progress) {
        if (!state.visible || !ensureReady() || !resizeCanvas()) return;
        const gl = state.gl;
        const locations = state.locations;
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(state.program);
        gl.uniformMatrix4fv(locations.projection, false,
            perspective(34 * Math.PI / 180, state.canvas.width / state.canvas.height, 0.1, 40));

        const identityBase = state.animating ? state.total - 1 : state.total;
        for (let index = -5; index <= 5; index++) {
            const slot = index + progress;
            const beadIdentity = identityBase - index;
            const active = Math.max(0, 1 - Math.abs(slot));
            const y = -slot * 0.565;
            const x = Math.sin((slot + state.total * 0.035) * 0.7) * 0.22;
            const z = -Math.abs(slot) * 0.075;
            const scale = 0.31 + active * 0.18;
            gl.uniform3f(locations.offset, x, y, z);
            gl.uniform1f(locations.scale, scale);
            gl.uniform1f(locations.yaw, state.yaw + beadIdentity * 0.37);
            gl.uniform1f(locations.tilt, state.tilt + Math.sin(slot * 0.5) * 0.08);
            gl.uniform1f(locations.active, active);
            gl.uniform1f(locations.seed, beadIdentity * 9.7);
            gl.drawElements(gl.TRIANGLES, state.indexCount, gl.UNSIGNED_SHORT, 0);
        }
    }

    function animationTick(now) {
        if (!state.visible) return;
        const duration = 620;
        const linear = Math.min(1, (now - state.animationStart) / duration);
        const eased = 1 - Math.pow(1 - linear, 3);
        render(eased);
        if (linear < 1) {
            state.animationFrame = requestAnimationFrame(animationTick);
        } else {
            state.animationFrame = 0;
            state.animating = false;
            render(0);
        }
    }

    function show(total) {
        state.visible = true;
        state.animating = false;
        state.total = Number(total) || 0;
        if (ensureReady()) {
            requestAnimationFrame(function () { render(0); });
        }
    }

    function hide() {
        state.visible = false;
        state.animating = false;
        cancelAnimationFrame(state.animationFrame);
        state.animationFrame = 0;
    }

    function advance(total) {
        state.total = Number(total) || 0;
        if (!state.visible || !ensureReady()) return;
        const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        cancelAnimationFrame(state.animationFrame);
        if (reduced) {
            state.animating = false;
            state.animationFrame = 0;
            render(0);
            return;
        }
        state.animating = true;
        state.animationStart = performance.now();
        state.animationFrame = requestAnimationFrame(animationTick);
    }

    function reset(total) {
        state.total = Number(total) || 0;
        state.animating = false;
        cancelAnimationFrame(state.animationFrame);
        state.animationFrame = 0;
        render(0);
    }

    window.Japamala3D = { show: show, hide: hide, advance: advance, reset: reset };
}());
