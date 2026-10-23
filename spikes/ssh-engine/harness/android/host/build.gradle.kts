plugins { id("org.jetbrains.kotlin.jvm") }
java { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }
dependencies {
    testImplementation(project(":api"))
    testImplementation(project(":russh"))
    testImplementation(project(":libssh2"))
    testImplementation("net.java.dev.jna:jna:5.17.0")
    testImplementation(kotlin("test"))
    testImplementation("org.junit.jupiter:junit-jupiter:5.12.2")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}
tasks.test {
    useJUnitPlatform()
    val libs = providers.gradleProperty("nativeLibs").getOrElse("${rootDir}/../../build/host")
    systemProperty("jna.library.path", libs)
    systemProperty("java.library.path", libs)
    listOf("SSH_TEST_HOST", "SSH_TEST_KEYS", "SSH_RESULTS_DIR", "SSH_TEST_ENGINES").forEach { k ->
        System.getenv(k)?.let { environment(k, it) }
    }
    testLogging { events("passed", "failed"); showStandardStreams = true; exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL }
    outputs.upToDateWhen { false }
}
