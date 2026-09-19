import XCTest
import WebKit
@testable import AstraPool

final class NativeTests: XCTestCase {
    func testAssetTraversal() {
        let root = URL(fileURLWithPath: "/tmp/Web")
        XCTAssertNil(AssetServer.assetURL(target: "/%2e%2e/secret", root: root))
        XCTAssertNil(AssetServer.assetURL(target: "/a/../../secret", root: root))
        XCTAssertEqual(AssetServer.assetURL(target: "/assets/game.js?v=1", root: root)?.path, root.resolvingSymlinksInPath().appendingPathComponent("assets/game.js").path)
    }
    func testInvites() {
        let id = "c6a68242-4248-490a-95de-000000000001"
        XCTAssertEqual(GameViewController.inviteID(URL(string: "https://astrapool.darrinm.com/#room=\(id)")!), id)
        XCTAssertEqual(GameViewController.inviteID(URL(string: "astra-pool://room/\(id)")!), id)
        XCTAssertNil(GameViewController.inviteID(URL(string: "https://evil.example/#room=\(id)")!))
        XCTAssertNil(GameViewController.inviteID(URL(string: "astra-pool://room/nope")!))
    }
    @MainActor func testBundledGameAndWorker() async throws {
        let controller = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first?.windows.first?.rootViewController as? GameViewController)
        let web = try XCTUnwrap(controller.webView)
        var loaded = false
        for _ in 0..<120 {
            if (try? await web.evaluateJavaScript("!!window.playful && document.getElementById('loading-screen').hidden")) as? Bool == true { loaded = true; break }
            try await Task.sleep(nanoseconds: 500_000_000)
        }
        XCTAssertTrue(loaded, "Bundled Three.js and Rapier must start without a hosted website")
        guard loaded else { return }
        let collections = try await web.evaluateJavaScript("Array.from(document.querySelectorAll('#style button'), button => button.dataset.style)")
        XCTAssertEqual(collections as? [String], ["balls", "planets"], "Only bundled collections should be offered")
        XCTAssertFalse(FileManager.default.fileExists(atPath: Bundle.main.resourceURL!.appendingPathComponent("Web/heads").path))
        // No shot or table gesture has occurred: startup must have prepared all takes.
        let audio = try await web.callAsyncJavaScript("""
        const audio = window.playful.scene().audio;
        if (!audio.preparing) throw Error('Background sound preparation did not start');
        await audio.preparing;
        const manifest = await fetch('/sfx/manifest.json').then(r => r.json());
        const ready = Object.entries(manifest).every(([cat, files]) =>
          audio.buffers[cat]?.length === files.length && audio.buffers[cat].every(b => b.length > 0));
        let decodes = 0;
        const original = audio.ctx.decodeAudioData.bind(audio.ctx);
        audio.ctx.decodeAudioData = (...args) => { decodes++; return original(...args); };
        const timings = {};
        for (const kind of ['cueTip', 'ballBall', 'cushion', 'pocket', 'rattle']) {
          const start = performance.now();
          audio[kind](0.5, 0, 0);
          timings[kind] = performance.now() - start;
          await new Promise(r => setTimeout(r, 300));
        }
        audio.ctx.decodeAudioData = original;
        return { ready, decodes, timings };
        """, arguments: [:], in: nil, contentWorld: .page) as? [String: Any]
        XCTAssertEqual(audio?["ready"] as? Bool, true)
        XCTAssertEqual(audio?["decodes"] as? Int, 0, "First playback must reuse decoded samples")
        let audioReport = XCTAttachment(string: String(describing: audio))
        audioReport.name = "First-play audio preparation and scheduling timings"
        audioReport.lifetime = .keepAlways
        add(audioReport)
        let assets = try FileManager.default.contentsOfDirectory(atPath: Bundle.main.resourceURL!.appendingPathComponent("Web/assets").path)
        let worker = try XCTUnwrap(assets.first { $0.hasPrefix("computer-worker-") && $0.hasSuffix(".js") })
        try await web.evaluateJavaScript("document.querySelector('#welcome [data-game=free]').click()")
        try await Task.sleep(nanoseconds: 3_000_000_000)
        // Exercise a real Rapier snapshot and shot in the bundled prediction worker.
        let result = try await web.callAsyncJavaScript("""
        return await new Promise((resolve,reject)=>{
          const w=new Worker('/assets/'+file,{type:'module'});
          const timer=setTimeout(()=>{w.terminate();reject(Error('Worker timed out'));},30000);
          w.onerror=e=>{clearTimeout(timer);w.terminate();reject(Error(e.message));};
          w.onmessage=e=>{clearTimeout(timer);w.terminate();if(e.data.error)reject(Error(e.data.error));else resolve(e.data.id===77 && Array.isArray(e.data.paths));};
          const world=window.playful.world,handles=[];
          world.forEachRigidBody(b=>{if(b.isDynamic() && b.isEnabled())handles.push({number:handles.length,handle:b.handle});});
          w.postMessage({aimPreview:true,id:77,table:{snapshot:world.takeSnapshot(),feltZ:-1.65,cushions:[],handles},shot:{dir:{x:1,y:0},speed:10,spin:{x:0,y:0},lookAhead:1}});
        });
        """, arguments: ["file": worker], in: nil, contentWorld: .page)
        XCTAssertEqual(result as? Bool, true)
        let secure = try await web.evaluateJavaScript("isSecureContext && typeof crypto.randomUUID === 'function'")
        XCTAssertEqual(secure as? Bool, true)
        XCTAssertEqual(web.url?.host, "127.0.0.1")
        let gameURL = web.url
        let policyLink = "document.querySelector('a[href=\"/privacy.html\"]')"
        try await web.evaluateJavaScript("window.policyTestGame = window.playful; \(policyLink).click()")
        for _ in 0..<40 {
            if controller.presentedViewController is UINavigationController { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        let sheet = try XCTUnwrap(controller.presentedViewController as? UINavigationController)
        let policy = try XCTUnwrap(sheet.topViewController as? PrivacyViewController)
        var policyLoaded = false
        for _ in 0..<60 {
            if (try? await policy.webView.evaluateJavaScript("document.querySelector('h1')?.textContent === 'Privacy Policy' && document.body.textContent.includes('Changes and questions')")) as? Bool == true {
                policyLoaded = true; break
            }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTAssertTrue(policyLoaded, "The complete policy must load from the bundle, without Safari or a remote website")
        XCTAssertEqual(policy.webView.url?.host, "127.0.0.1")
        XCTAssertEqual(policy.webView.url?.path, "/privacy.html")
        let bundledPolicy = try String(contentsOf: Bundle.main.resourceURL!.appendingPathComponent("Web/privacy.html"), encoding: .utf8)
        XCTAssertTrue(bundledPolicy.contains("<h1>Privacy Policy</h1>"))
        try await policy.webView.evaluateJavaScript("document.querySelector('a[href=\"/\"]').click()")
        for _ in 0..<40 {
            if controller.presentedViewController == nil { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTAssertNil(controller.presentedViewController)
        XCTAssertEqual(web.url, gameURL)
        let sameGame = try await web.evaluateJavaScript("window.policyTestGame === window.playful")
        XCTAssertEqual(sameGame as? Bool, true, "Closing the policy must preserve the current game")
        let rejected = try await web.callAsyncJavaScript("try { await webkit.messageHandlers.astra.postMessage({action:'request',path:'/api/admin',body:''}); return false; } catch { return true; }", arguments: [:], in: nil, contentWorld: .page)
        XCTAssertEqual(rejected as? Bool, true, "The native bridge must not be a general-purpose proxy")
        controller.setActive(false)
        try await Task.sleep(nanoseconds: 200_000_000)
        let pausedFrames = try await web.evaluateJavaScript("window.playful.perf.frames") as? Int
        try await Task.sleep(nanoseconds: 400_000_000)
        let stillFrames = try await web.evaluateJavaScript("window.playful.perf.frames") as? Int
        XCTAssertEqual(pausedFrames, stillFrames)
        controller.setActive(true)
        try await Task.sleep(nanoseconds: 400_000_000)
        let resumedFrames = try await web.evaluateJavaScript("window.playful.perf.frames") as? Int
        XCTAssertGreaterThan(resumedFrames ?? 0, pausedFrames ?? 0)
    }
}
