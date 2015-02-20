package main

import (
	"log"
	"net/http"

	"github.com/rubenv/broadcaster"
)

func main() {
	s := &broadcaster.Server{}

	err := s.Prepare()
	if err != nil {
		panic(err)
	}

	http.Handle("/broadcaster/", s)

	log.Fatal(http.ListenAndServe(":8080", nil))
}
