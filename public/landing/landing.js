// 1. THREE.JS INTERACTIVE CATALOG GRAPH ENGINE
    (function initThreeJSHero() {
      const container = document.getElementById('threejs-hero-container');
      if (!container) return;

      const width = container.clientWidth || window.innerWidth || 1200;
      const height = container.clientHeight || 600;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      camera.position.set(0, 1.2, 10.5);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.3;
      container.appendChild(renderer.domElement);

      // Cinematic Lighting
      const ambientLight = new THREE.AmbientLight(0x061811, 2.8);
      scene.add(ambientLight);

      const keyLight = new THREE.DirectionalLight(0x10b981, 4.0);
      keyLight.position.set(8, 10, 7);
      scene.add(keyLight);

      const rimLight = new THREE.PointLight(0x34d399, 3.5, 35);
      rimLight.position.set(-8, -4, 5);
      scene.add(rimLight);

      const rootGroup = new THREE.Group();
      scene.add(rootGroup);

      // Core Faceted Node (Shopify Health Nucleus)
      const coreGeom = new THREE.IcosahedronGeometry(1.3, 2);
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0x052e21,
        emissive: 0x065f46,
        emissiveIntensity: 0.85,
        roughness: 0.15,
        metalness: 0.8,
        flatShading: true
      });
      const coreMesh = new THREE.Mesh(coreGeom, coreMat);
      rootGroup.add(coreMesh);

      // Floating Lattice Cage
      const cageGeom = new THREE.IcosahedronGeometry(1.8, 1);
      const cageMat = new THREE.MeshStandardMaterial({
        color: 0x10b981,
        wireframe: true,
        transparent: true,
        opacity: 0.4,
        emissive: 0x10b981,
        emissiveIntensity: 0.5
      });
      const cageMesh = new THREE.Mesh(cageGeom, cageMat);
      rootGroup.add(cageMesh);

      // Catalog Telemetry Disc (Turbine)
      const discGeom = new THREE.CylinderGeometry(2.3, 2.3, 0.14, 64);
      const discMat = new THREE.MeshStandardMaterial({
        color: 0x0c1c16,
        metalness: 0.85,
        roughness: 0.25
      });
      const discMesh = new THREE.Mesh(discGeom, discMat);
      discMesh.rotation.x = Math.PI * 0.35;
      rootGroup.add(discMesh);

      // Orbital Synapse Rings
      const rings = [];
      const ringConfigs = [
        { radius: 3.0, tube: 0.02, rotX: 1.2, rotY: 0.3, speed: 0.4, color: 0x10b981 },
        { radius: 3.7, tube: 0.016, rotX: 0.4, rotY: 1.1, speed: -0.3, color: 0x34d399 },
        { radius: 4.4, tube: 0.012, rotX: 1.8, rotY: -0.7, speed: 0.22, color: 0x059669 }
      ];

      ringConfigs.forEach(cfg => {
        const rGeom = new THREE.TorusGeometry(cfg.radius, cfg.tube, 16, 100);
        const rMat = new THREE.MeshStandardMaterial({
          color: cfg.color,
          emissive: cfg.color,
          emissiveIntensity: 0.8,
          roughness: 0.2
        });
        const rMesh = new THREE.Mesh(rGeom, rMat);
        rMesh.rotation.x = cfg.rotX;
        rMesh.rotation.y = cfg.rotY;
        rootGroup.add(rMesh);
        rings.push({ mesh: rMesh, speed: cfg.speed });
      });

      // Orbiting Satellites (Products, SEO, Image, Schema, AI Assistant)
      const agentCount = 5;
      const agents = [];
      const agentGeom = new THREE.OctahedronGeometry(0.24, 0);

      for (let i = 0; i < agentCount; i++) {
        const agentMat = new THREE.MeshStandardMaterial({
          color: 0x6ee7b7,
          emissive: 0x10b981,
          emissiveIntensity: 1.4,
          roughness: 0.1
        });
        const agentMesh = new THREE.Mesh(agentGeom, agentMat);
        rootGroup.add(agentMesh);
        agents.push({
          mesh: agentMesh,
          radius: 3.2 + (i % 2) * 0.9,
          angleOffset: (i / agentCount) * Math.PI * 2,
          speed: 0.45 + (i * 0.1),
          verticalAmp: 0.6 + (i * 0.1),
          verticalFreq: 1.3 + (i * 0.2)
        });
      }

      // Constellation Particles
      const pCount = 200;
      const pPositions = new Float32Array(pCount * 3);
      for (let i = 0; i < pCount; i++) {
        const r = 2.0 + Math.random() * 3.5;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        pPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        pPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.7;
        pPositions[i * 3 + 2] = r * Math.cos(phi);
      }
      const pGeom = new THREE.BufferGeometry();
      pGeom.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
      const pMat = new THREE.PointsMaterial({
        color: 0xa7f3d0,
        size: 0.055,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending
      });
      const pSystem = new THREE.Points(pGeom, pMat);
      rootGroup.add(pSystem);

      // Interactive Mouse / Scroll Listeners
      let mouseX = 0, mouseY = 0;
      let targetX = 0, targetY = 0;

      container.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        mouseX = (x - 0.5) * 2;
        mouseY = -(y - 0.5) * 1.5;
      });

      window.addEventListener('resize', () => {
        const newW = container.clientWidth || window.innerWidth;
        const newH = container.clientHeight || 600;
        camera.aspect = newW / newH;
        camera.updateProjectionMatrix();
        renderer.setSize(newW, newH);
      });

      const clock = new THREE.Clock();
      function animate() {
        requestAnimationFrame(animate);
        const time = clock.getElapsedTime();

        targetX += (mouseX - targetX) * 0.05;
        targetY += (mouseY - targetY) * 0.05;

        rootGroup.rotation.y = time * 0.18 + targetX * 0.8;
        rootGroup.rotation.x = 0.15 + targetY * 0.5;

        const pulse = 1.0 + Math.sin(time * 2.5) * 0.05;
        coreMesh.scale.set(pulse, pulse, pulse);
        coreMesh.rotation.y += 0.006;

        cageMesh.rotation.y = -time * 0.22;
        discMesh.rotation.z = time * 0.35;

        rings.forEach(r => r.mesh.rotation.z += r.speed * 0.015);

        agents.forEach((ag, i) => {
          const angle = time * ag.speed + ag.angleOffset;
          ag.mesh.position.x = Math.cos(angle) * ag.radius;
          ag.mesh.position.z = Math.sin(angle) * ag.radius;
          ag.mesh.position.y = Math.sin(time * ag.verticalFreq + i) * ag.verticalAmp;
          ag.mesh.rotation.x += 0.03;
          ag.mesh.rotation.y += 0.04;
        });

        renderer.render(scene, camera);
      }
      animate();
    })();

    // 2. LIVE SCAN SIMULATION TRIGGER
    window.runInteractiveScan = function() {
      const btn = document.getElementById('scanTriggerBtn');
      const text = document.getElementById('scanBtnText');
      const icon = document.getElementById('scanBtnIcon');
      const hudScore = document.getElementById('hudHealthScore');
      const storeInput = document.getElementById('storeDomainInput');

      if (!btn || !text || !icon) return;

      text.textContent = "Scanning Catalog Graph...";
      icon.textContent = "sync";
      icon.classList.add("animate-spin");
      btn.classList.add("opacity-80");

      setTimeout(() => {
        text.textContent = "Scan Complete (94.2%)";
        icon.textContent = "verified";
        icon.classList.remove("animate-spin");
        btn.classList.remove("opacity-80");

        if (hudScore) {
          hudScore.innerHTML = `94.2% <span class="font-label-mono text-xs text-mint-accent">+18.5% Lift</span>`;
        }

        // Add feedback message to AI chat
        const chat = document.getElementById('chatMessages');
        if (chat) {
          const alert = document.createElement('div');
          alert.className = 'flex items-start gap-3';
          alert.innerHTML = `
            <div class="w-7 h-7 rounded-lg bg-brand-deep border border-primary/30 flex items-center justify-center text-mint-accent shrink-0 mt-0.5">
              <span class="material-symbols-outlined text-sm">radar</span>
            </div>
            <div class="flex-1 p-3.5 rounded-2xl bg-brand-deep/60 border border-primary/40 text-xs font-label-mono text-mint-light">
              Fresh scan completed for <strong>${storeInput ? storeInput.value : 'your-store.myshopify.com'}</strong>! 18 open issues ready for review in the Health Inspector.
            </div>
          `;
          chat.appendChild(alert);
          chat.scrollTop = chat.scrollHeight;
        }

        setTimeout(() => {
          text.textContent = "Simulate Live Scan";
          icon.textContent = "radar";
        }, 4000);
      }, 1400);
    };

    // 3. AI ASSISTANT CHAT INTERACTIONS
    window.sendAssistantSample = function(promptText) {
      const input = document.getElementById('assistantInput');
      if (input) {
        input.value = promptText;
        window.sendCustomAssistantMessage();
      }
    };

    window.sendCustomAssistantMessage = function() {
      const input = document.getElementById('assistantInput');
      const chat = document.getElementById('chatMessages');
      if (!input || !chat || !input.value.trim()) return;

      const userText = input.value.trim();
      input.value = '';

      // Append User message
      const userBubble = document.createElement('div');
      userBubble.className = 'flex items-start justify-end gap-3';
      userBubble.innerHTML = `
        <div class="p-3.5 rounded-2xl bg-primary text-background font-medium max-w-[85%] text-xs sm:text-sm">
          ${userText}
        </div>
        <div class="w-7 h-7 rounded-lg bg-surface-container border border-surface-border flex items-center justify-center text-text-primary shrink-0 mt-0.5">
          <span class="material-symbols-outlined text-sm">person</span>
        </div>
      `;
      chat.appendChild(userBubble);
      chat.scrollTop = chat.scrollHeight;

      // Generate context-aware grounded assistant answer
      setTimeout(() => {
        let answerText = "";
        const lower = userText.toLowerCase();

        if (lower.includes("biggest") || lower.includes("issue")) {
          answerText = "Your biggest open items are: <strong>1) 14 missing meta titles/descriptions</strong> on high-traffic product variants, <strong>2) 3 oversized home banners (>4MB)</strong> slowing mobile page speed, and <strong>3) 1 collection page</strong> with zero description. Fixing these will raise your score to 99.4%.";
        } else if (lower.includes("seo") || lower.includes("description")) {
          answerText = "Under your <em>Products Scan</em>, the <strong>Apex Carbon Fiber Wing</strong> and <strong>Valved Titanium Exhaust</strong> need expanded technical specs. Head to the <em>SEO &amp; Collections</em> tab where high-CTR titles (clamped to 58 characters) are already staged.";
        } else if (lower.includes("sale") || lower.includes("black friday")) {
          answerText = "Before running promotional campaigns: <strong>1.</strong> Compress your 3 oversized hero images using our `sharp` pipeline, <strong>2.</strong> Verify all sale items have <code>availability: InStock</code> schema, and <strong>3.</strong> Ensure WCAG 2.2 AA contrast on checkout banners.";
        } else {
          answerText = `I analyzed your question regarding <em>"${userText}"</em> against your live store data. With 18 open issues remaining, we recommend running your staged bulk fixes first. You still have 4,800 monthly fixes available on your Business plan quota!`;
        }

        const botBubble = document.createElement('div');
        botBubble.className = 'flex items-start gap-3';
        botBubble.innerHTML = `
          <div class="w-7 h-7 rounded-lg bg-brand-deep border border-primary/30 flex items-center justify-center text-mint-accent shrink-0 mt-0.5">
            <span class="material-symbols-outlined text-sm">neurology</span>
          </div>
          <div class="flex-1 p-4 rounded-2xl bg-surface-elevated border border-surface-border space-y-2">
            <p class="text-text-primary leading-relaxed text-xs sm:text-sm">
              ${answerText}
            </p>
          </div>
        `;
        chat.appendChild(botBubble);
        chat.scrollTop = chat.scrollHeight;
      }, 700);
    };

    window.resetChat = function() {
      const chat = document.getElementById('chatMessages');
      if (chat) {
        chat.innerHTML = `
          <div class="flex items-start gap-3">
            <div class="w-7 h-7 rounded-lg bg-brand-deep border border-primary/30 flex items-center justify-center text-mint-accent shrink-0 mt-0.5">
              <span class="material-symbols-outlined text-sm">neurology</span>
            </div>
            <div class="flex-1 p-4 rounded-2xl bg-surface-elevated border border-surface-border space-y-2">
              <p class="text-text-primary leading-relaxed">
                Chat reset. I am connected to your live catalog. What would you like to inspect next?
              </p>
            </div>
          </div>
        `;
      }
    };

    // 4. SIMULATOR TABS & ACTIONS
    window.switchSimTab = function(tabId) {
      document.querySelectorAll('.sim-pane').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('.sim-nav-btn').forEach(b => {
        b.classList.remove('bg-brand-deep', 'text-mint-accent', 'border', 'border-primary/30');
        b.classList.add('text-text-muted');
        b.setAttribute('aria-selected', 'false');
      });

      const pane = document.getElementById('sim-tab-' + tabId);
      if (pane) pane.classList.remove('hidden');

      const btn = document.getElementById('btn-tab-' + tabId);
      if (btn) {
        btn.classList.remove('text-text-muted');
        btn.classList.add('bg-brand-deep', 'text-mint-accent', 'border', 'border-primary/30');
        btn.setAttribute('aria-selected', 'true');
      }
    };

    window.fixSingleItem = function(btn, successMsg) {
      btn.textContent = "Applied!";
      btn.className = "px-3.5 py-1.5 rounded-lg bg-primary text-background font-label-mono text-xs font-bold pointer-events-none";
      const card = btn.closest('.flex-col');
      if (card) {
        const note = document.createElement('div');
        note.className = "text-xs font-label-mono text-mint-accent mt-2 flex items-center gap-1";
        note.innerHTML = `<span class="material-symbols-outlined text-xs">check_circle</span> ${successMsg}`;
        card.appendChild(note);
      }
    };

    window.applyAllSimulatedFixes = function() {
      const container = document.getElementById('productListContainer');
      if (container) {
        container.innerHTML = `
          <div class="p-6 rounded-2xl bg-brand-deep/50 border border-primary/50 text-center space-y-2">
            <span class="material-symbols-outlined text-3xl text-mint-accent">verified</span>
            <h4 class="font-display-hero text-base font-bold text-text-primary">All 18 Staged Fixes Committed</h4>
            <p class="font-body-sm text-xs text-text-muted max-w-md mx-auto">
              Descriptions, Google-valid Schema.org JSON-LD, WCAG 2.2 AA alt-tags, and lossless AVIF media applied safely via Shopify GraphQL sandbox with 1-click rollback preserved.
            </p>
          </div>
        `;
      }
    };
