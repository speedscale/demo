package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/gorilla/mux"
	_ "github.com/lib/pq"
)

type User struct {
	ID         int       `json:"id"`
	FirstName  string    `json:"first_name"`
	LastName   string    `json:"last_name"`
	Email      string    `json:"email"`
	Username   string    `json:"username"`
	Age        int       `json:"age"`
	Phone      string    `json:"phone"`
	Address    string    `json:"address"`
	City       string    `json:"city"`
	Country    string    `json:"country"`
	JobTitle   string    `json:"job_title"`
	Department string    `json:"department"`
	Salary     int       `json:"salary"`
	HireDate   time.Time `json:"hire_date"`
	IsActive   bool      `json:"is_active"`
}

var db *sql.DB

func main() {
	var err error

	// Get port from environment variable or use default
	port := os.Getenv("PGPORT")
	if port == "" {
		port = "5432"
	}

	// Get user from environment variable or use default
	user := os.Getenv("PGUSER")
	if user == "" {
		user = "postgres"
	}

	connStr := fmt.Sprintf("host=localhost port=%s user=%s dbname=postgres sslmode=disable", port, user)
	db, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()

	if err = db.Ping(); err != nil {
		log.Fatal("Failed to ping database:", err)
	}

	fmt.Println("Connected to PostgreSQL database!")

	if err := createTable(); err != nil {
		log.Fatal("Failed to create table:", err)
	}

	if err := insertDemoUsers(); err != nil {
		log.Fatal("Failed to insert demo users:", err)
	}

	r := mux.NewRouter()
	r.HandleFunc("/users", getUsersHandler).Methods("GET")
	r.HandleFunc("/users", createUserHandler).Methods("POST")
	r.HandleFunc("/users/{id}", updateUserHandler).Methods("PUT")
	r.HandleFunc("/users/{id}", deleteUserHandler).Methods("DELETE")

	fmt.Println("Server starting on port 8080...")
	log.Fatal(http.ListenAndServe(":8080", r))
}

func createTable() error {
	query := `
	CREATE TABLE IF NOT EXISTS users (
		id SERIAL PRIMARY KEY,
		first_name VARCHAR(50) NOT NULL,
		last_name VARCHAR(50) NOT NULL,
		email VARCHAR(100) UNIQUE NOT NULL,
		username VARCHAR(50) UNIQUE NOT NULL,
		age INTEGER,
		phone VARCHAR(20),
		address TEXT,
		city VARCHAR(50),
		country VARCHAR(50),
		job_title VARCHAR(100),
		department VARCHAR(50),
		salary INTEGER,
		hire_date TIMESTAMP,
		is_active BOOLEAN DEFAULT true
	)`
	_, err := db.Exec(query)
	return err
}

func insertDemoUsers() error {
	query := `
	INSERT INTO users (first_name, last_name, email, username, age, phone, address, city, country, job_title, department, salary, hire_date, is_active)
	VALUES
		($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
	ON CONFLICT (email) DO NOTHING`

	demoUsers := []User{
		{
			FirstName: "John", LastName: "Doe", Email: "john.doe@example.com", Username: "johndoe",
			Age: 30, Phone: "+1-555-0123", Address: "123 Main St", City: "New York", Country: "USA",
			JobTitle: "Software Engineer", Department: "Engineering", Salary: 85000,
			HireDate: time.Date(2020, 3, 15, 0, 0, 0, 0, time.UTC), IsActive: true,
		},
		{
			FirstName: "Jane", LastName: "Smith", Email: "jane.smith@example.com", Username: "janesmith",
			Age: 28, Phone: "+1-555-0124", Address: "456 Oak Ave", City: "San Francisco", Country: "USA",
			JobTitle: "Product Manager", Department: "Product", Salary: 95000,
			HireDate: time.Date(2021, 7, 22, 0, 0, 0, 0, time.UTC), IsActive: true,
		},
		{
			FirstName: "Bob", LastName: "Johnson", Email: "bob.johnson@example.com", Username: "bobjohnson",
			Age: 35, Phone: "+1-555-0125", Address: "789 Pine Rd", City: "Seattle", Country: "USA",
			JobTitle: "Senior Developer", Department: "Engineering", Salary: 105000,
			HireDate: time.Date(2019, 1, 10, 0, 0, 0, 0, time.UTC), IsActive: true,
		},
		{
			FirstName: "Alice", LastName: "Brown", Email: "alice.brown@example.com", Username: "alicebrown",
			Age: 32, Phone: "+1-555-0126", Address: "321 Elm St", City: "Austin", Country: "USA",
			JobTitle: "UX Designer", Department: "Design", Salary: 78000,
			HireDate: time.Date(2020, 11, 5, 0, 0, 0, 0, time.UTC), IsActive: true,
		},
		{
			FirstName: "Charlie", LastName: "Wilson", Email: "charlie.wilson@example.com", Username: "charliewilson",
			Age: 29, Phone: "+1-555-0127", Address: "654 Maple Dr", City: "Denver", Country: "USA",
			JobTitle: "Data Analyst", Department: "Analytics", Salary: 70000,
			HireDate: time.Date(2022, 2, 14, 0, 0, 0, 0, time.UTC), IsActive: false,
		},
	}

	for _, user := range demoUsers {
		_, err := db.Exec(query, user.FirstName, user.LastName, user.Email, user.Username,
			user.Age, user.Phone, user.Address, user.City, user.Country, user.JobTitle,
			user.Department, user.Salary, user.HireDate, user.IsActive)
		if err != nil {
			return fmt.Errorf("failed to insert user %s: %w", user.Email, err)
		}
	}

	fmt.Println("Demo users inserted successfully!")
	return nil
}

func getUsersHandler(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query("SELECT id, first_name, last_name, email, username, age, phone, address, city, country, job_title, department, salary, hire_date, is_active FROM users")
	if err != nil {
		http.Error(w, "Failed to fetch users", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var user User
		err := rows.Scan(&user.ID, &user.FirstName, &user.LastName, &user.Email, &user.Username,
			&user.Age, &user.Phone, &user.Address, &user.City, &user.Country, &user.JobTitle,
			&user.Department, &user.Salary, &user.HireDate, &user.IsActive)
		if err != nil {
			http.Error(w, "Failed to scan user", http.StatusInternalServerError)
			return
		}
		users = append(users, user)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}

func createUserHandler(w http.ResponseWriter, r *http.Request) {
	var user User
	if err := json.NewDecoder(r.Body).Decode(&user); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	query := `
	INSERT INTO users (first_name, last_name, email, username, age, phone, address, city, country, job_title, department, salary, hire_date, is_active)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
	RETURNING id`

	err := db.QueryRow(query, user.FirstName, user.LastName, user.Email, user.Username,
		user.Age, user.Phone, user.Address, user.City, user.Country, user.JobTitle,
		user.Department, user.Salary, user.HireDate, user.IsActive).Scan(&user.ID)

	if err != nil {
		http.Error(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(user)
}

func updateUserHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	var user User
	if err := json.NewDecoder(r.Body).Decode(&user); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	query := `
	UPDATE users SET first_name=$1, last_name=$2, email=$3, username=$4, age=$5, phone=$6,
	address=$7, city=$8, country=$9, job_title=$10, department=$11, salary=$12, hire_date=$13, is_active=$14
	WHERE id=$15`

	result, err := db.Exec(query, user.FirstName, user.LastName, user.Email, user.Username,
		user.Age, user.Phone, user.Address, user.City, user.Country, user.JobTitle,
		user.Department, user.Salary, user.HireDate, user.IsActive, id)

	if err != nil {
		http.Error(w, "Failed to update user", http.StatusInternalServerError)
		return
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil || rowsAffected == 0 {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	user.ID = id
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

func deleteUserHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	result, err := db.Exec("DELETE FROM users WHERE id=$1", id)
	if err != nil {
		http.Error(w, "Failed to delete user", http.StatusInternalServerError)
		return
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil || rowsAffected == 0 {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
