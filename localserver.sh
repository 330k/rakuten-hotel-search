#!/bin/bash

docker run --rm -v $(pwd):/usr/share/nginx/html:ro -p 8086:80 nginx
