package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/garyburd/redigo/redis"
	"github.com/rubenv/broadcaster"
)

func main() {
	redisPort := 28795

	s := &broadcaster.Server{
		RedisHost: fmt.Sprintf("localhost:%d", redisPort),
	}

	err := s.Prepare()
	if err != nil {
		panic(err)
	}

	redisClient, err := redis.Dial("tcp", fmt.Sprintf(":%d", redisPort))
	if err != nil {
		panic(err)
	}

	http.Handle("/broadcaster/", s)
	http.HandleFunc("/publish/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")

		err := r.ParseForm()
		if err != nil {
			http.Error(w, err.Error(), 500)
		}

		channel := r.FormValue("channel")
		message := r.FormValue("message")
		_, err = redisClient.Do("PUBLISH", channel, message)
		if err != nil {
			http.Error(w, err.Error(), 500)
		}

		fmt.Fprintf(w, "OK")
	})

	log.Fatal(http.ListenAndServe(":8080", nil))
}
