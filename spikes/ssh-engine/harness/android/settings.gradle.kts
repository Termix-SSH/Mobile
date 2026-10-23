pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "termix-ssh-harness"
include(":api", ":russh", ":libssh2", ":host")
// The Android app needs the SDK, so it is opt in for host only runs.
if (providers.gradleProperty("withAndroid").orNull == "true") include(":app")
