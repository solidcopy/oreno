pub mod build;

fn main() {
    println!("Hello, world! {}", env!("CARGO_MANIFEST_DIR"));
}
