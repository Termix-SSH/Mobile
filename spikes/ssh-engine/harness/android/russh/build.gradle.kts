plugins { id("org.jetbrains.kotlin.jvm") }
java { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }
// Bindings come from russh/gen-bindings.sh
sourceSets["main"].kotlin.srcDir("../../../russh/generated/kotlin")
dependencies {
    implementation(project(":api"))
    compileOnly("net.java.dev.jna:jna:5.17.0")
}
