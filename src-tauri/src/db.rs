use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Product {
    pub id: Option<i64>,
    pub code: String,
    pub name: String,
    pub price: f64,
}

pub fn init_db() -> Result<Connection> {
    let conn = Connection::open("produtos.db")?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY,
            code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            price REAL NOT NULL
        )",
        [],
    )?;

    Ok(conn)
}

pub fn add_product(product: Product) -> Result<i64> {
    let conn = init_db()?;
    
    conn.execute(
        "INSERT INTO products (code, name, price) VALUES (?1, ?2, ?3)",
        (&product.code, &product.name, &product.price),
    )?;

    Ok(conn.last_insert_rowid())
}

pub fn get_products() -> Result<Vec<Product>> {
    let conn = init_db()?;
    let mut stmt = conn.prepare("SELECT id, code, name, price FROM products")?;
    
    let products = stmt.query_map([], |row| {
        Ok(Product {
            id: Some(row.get(0)?),
            code: row.get(1)?,
            name: row.get(2)?,
            price: row.get(3)?,
        })
    })?;

    let mut result = Vec::new();
    for product in products {
        result.push(product?);
    }

    Ok(result)
}

pub fn update_product(product: Product) -> Result<()> {
    let conn = init_db()?;
    
    conn.execute(
        "UPDATE products SET code = ?1, name = ?2, price = ?3 WHERE id = ?4",
        (&product.code, &product.name, &product.price, &product.id),
    )?;

    Ok(())
}

pub fn delete_product(id: i64) -> Result<()> {
    let conn = init_db()?;
    conn.execute("DELETE FROM products WHERE id = ?1", [id])?;
    Ok(())
}