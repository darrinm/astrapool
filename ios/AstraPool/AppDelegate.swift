import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Game", sessionRole: session.role)
        configuration.delegateClass = GameSceneDelegate.self
        return configuration
    }
}

final class GameSceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private let game = GameViewController()
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: scene); window.rootViewController = game
        window.makeKeyAndVisible(); self.window = window
        if let url = options.urlContexts.first?.url { game.openInvite(url) }
    }
    func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
        if let url = contexts.first?.url { game.openInvite(url) }
    }
    func sceneWillResignActive(_ scene: UIScene) { game.setActive(false) }
    func sceneDidBecomeActive(_ scene: UIScene) { game.setActive(true) }
}
