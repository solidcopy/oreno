pub mod build;

trait MyTrait {
    fn a();

    #[cfg(test)]
    fn b();
}

struct MyStruct {}

impl MyTrait for MyStruct {
    fn a() {
        println!("a");
    }

    #[cfg(test)]
    fn b() {
        println!("b");
    }
}

fn main() {
    MyStruct::a();
}

#[cfg(test)]
mod test {
    use super::MyStruct;
    use super::MyTrait;
    #[test]
    fn test() {
        MyStruct::b();
    }
}
