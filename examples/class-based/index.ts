/**
 * Class-Based Slices Example
 *
 * This example demonstrates:
 * - Extending the Slice base class
 * - Class-based slice definitions with instance methods
 * - Type-safe slice retrieval using generics
 * - Organizing complex slices with shared state
 */

import Loaf from "../../src/loaf";
import Slice from "../../src/slice";
import { useLoaf } from "../../src/context";

// Define a custom event for user authentication
enum AuthEvents {
  Login = "auth:login",
  Logout = "auth:logout"
}

/**
 * User Authentication Slice
 *
 * This class-based slice manages user authentication state
 * and provides methods for other slices to use
 */
class AuthSlice extends Slice {
  // Slice properties
  name = "auth";
  dependencies = ["config"];
  allow = [AuthEvents.Login, AuthEvents.Logout];

  // Private state managed by this slice
  private currentUser: string | null = null;
  private sessions: Map<string, Date> = new Map();

  // Slice's constructor takes no arguments - Loaf calls `new AuthSlice()`.
  // Use useLoaf() inside handlers when you need the loaf.
  constructor() {
    super();
  }

  // Lifecycle handlers take no arguments and their return values are ignored
  [Loaf.Initialize] = async () => {
    console.log("[Auth] Initializing authentication system...");
    this.currentUser = null;
  };

  [Loaf.Ready] = async () => {
    console.log("[Auth] Auth system is ready");
  };

  // Custom crumbs receive (previousValue, ...args) - no trailing loaf/slice
  [AuthEvents.Login] = async (username: string) => {
    console.log(`  [Auth] User "${username}" logging in...`);
    this.currentUser = username;
    this.sessions.set(username, new Date());
    return username;
  };

  [AuthEvents.Logout] = async () => {
    if (this.currentUser) {
      console.log(`  [Auth] User "${this.currentUser}" logging out...`);
      this.sessions.delete(this.currentUser);
      this.currentUser = null;
    }
  };

  // Public methods that other slices can call
  getCurrentUser(): string | null {
    return this.currentUser;
  }

  isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  getSessionInfo(username: string): Date | undefined {
    return this.sessions.get(username);
  }
}

/**
 * Config Slice
 *
 * Simple class-based configuration slice
 */
class ConfigSlice extends Slice {
  name = "config";
  private config: Record<string, any> = {};

  constructor() {
    super();
  }

  [Loaf.Initialize] = async () => {
    console.log("[Config] Loading configuration...");
    this.config = {
      appName: "Class-Based Example",
      version: "1.0.0",
      maxSessions: 10
    };
  };

  [Loaf.Ready] = async () => {
    console.log("[Config] Configuration loaded");
  };

  get(key: string): any {
    return this.config[key];
  }

  set(key: string, value: any): void {
    this.config[key] = value;
  }
}

/**
 * API Slice
 *
 * Demonstrates using methods from other slices
 */
class ApiSlice extends Slice {
  name = "api";
  dependencies = ["auth", "config"];
  allow = [AuthEvents.Login, AuthEvents.Logout];

  constructor() {
    super();
  }

  [Loaf.Initialize] = async () => {
    console.log("[API] Setting up API endpoints...");
  };

  [Loaf.Ready] = async () => {
    console.log("[API] API is ready");

    // Get the current loaf from context, then use type-safe generic to
    // fetch other slices
    const loaf = useLoaf();
    const auth = loaf.get<AuthSlice>("auth");
    const config = loaf.get<ConfigSlice>("config");

    console.log(`\n[API] App: ${config.get("appName")} v${config.get("version")}`);

    // Simulate user login flow
    console.log("\n[API] Simulating user login...");
    await loaf.execute(AuthEvents.Login, "alice");

    // Use auth methods directly
    console.log(`[API] Current user: ${auth.getCurrentUser()}`);
    console.log(`[API] Is authenticated: ${auth.isAuthenticated()}`);
    console.log(`[API] Total sessions: ${auth.getSessionCount()}`);

    // Login another user
    console.log("\n[API] Another user logging in...");
    await loaf.execute(AuthEvents.Login, "bob");

    console.log(`[API] Current user: ${auth.getCurrentUser()}`);
    console.log(`[API] Total sessions: ${auth.getSessionCount()}`);

    // Check session info
    const aliceSession = auth.getSessionInfo("alice");
    if (aliceSession) {
      console.log(`[API] Alice's session started at: ${aliceSession.toISOString()}`);
    }

    // Logout
    console.log("\n[API] Logging out...");
    await loaf.execute(AuthEvents.Logout);

    console.log(`[API] Current user: ${auth.getCurrentUser()}`);
    console.log(`[API] Is authenticated: ${auth.isAuthenticated()}`);
    console.log(`[API] Total sessions: ${auth.getSessionCount()}\n`);
  };

  // Listen to login events
  [AuthEvents.Login] = async (username: string) => {
    console.log(`  [API] Recording login event for "${username}"`);
    return username;
  };

  // Listen to logout events
  [AuthEvents.Logout] = async () => {
    console.log(`  [API] Recording logout event`);
  };
}

// Main execution
async function main() {
  console.log("=== Starting Class-Based Slices Example ===\n");

  const loaf = new Loaf({
    name: "class-based-app",
    slices: [
      // Pass the classes - Loaf instantiates each one with `new SliceClass()`.
      // No constructor arguments are passed, so use useLoaf() inside handlers
      // (or a buildSlice(loaf) factory) when you need the loaf.
      ConfigSlice,
      AuthSlice,
      ApiSlice
    ],
    crumbNames: Object.values(AuthEvents),
    devMode: false
  });

  await loaf.start();

  console.log("=== Example complete ===");
}

main().catch(console.error);

/**
 * Expected Output:
 *
 * === Starting Class-Based Slices Example ===
 *
 * [Config] Loading configuration...
 * [Auth] Initializing authentication system...
 * [API] Setting up API endpoints...
 * [Config] Configuration loaded
 * [Auth] Auth system is ready
 * [API] API is ready
 *
 * [API] App: Class-Based Example v1.0.0
 *
 * [API] Simulating user login...
 *   [Auth] User "alice" logging in...
 *   [API] Recording login event for "alice"
 * [API] Current user: alice
 * [API] Is authenticated: true
 * [API] Total sessions: 1
 *
 * [API] Another user logging in...
 *   [Auth] User "bob" logging in...
 *   [API] Recording login event for "bob"
 * [API] Current user: bob
 * [API] Total sessions: 2
 * [API] Alice's session started at: 2024-XX-XXTXX:XX:XX.XXXZ
 *
 * [API] Logging out...
 *   [Auth] User "bob" logging out...
 *   [API] Recording logout event
 * [API] Current user: null
 * [API] Is authenticated: false
 * [API] Total sessions: 1
 *
 * === Example complete ===
 *
 * Key Takeaways:
 * 1. Class-based slices can maintain private state
 * 2. Public methods allow other slices to interact safely
 * 3. loaf.get<Type>() provides type-safe slice retrieval
 * 4. Classes are great for complex slices with multiple methods
 * 5. Lifecycle events use arrow functions to preserve 'this' context
 * 6. useLoaf() fetches the current loaf from inside a handler - no constructor
 *    or handler argument needed
 */
