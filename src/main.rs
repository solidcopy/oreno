pub mod build;

fn main() {
    let a = "a".to_owned();
    let b = "b".to_owned();
    let o = a.partial_cmp(&b).unwrap();
    println!("{:?}", &o);
}
