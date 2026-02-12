#!/bin/bash
# Script pour planifier l'allumage et la mise en standby de la TV

# Répertoire pour le log
LOG_FILE="/home/XhamiaNur/tv_control.log"

# Fonction pour allumer la TV via CEC
turn_tv_on() {
  echo "$(date): Tentative d'allumage de la TV..." >>"$LOG_FILE"
  echo "on 0" | cec-client -s -d 1

  if [ $? -eq 0 ]; then
    echo "$(date): TV allumée avec succès" >>"$LOG_FILE"
  else
    echo "$(date): ERREUR lors de l'allumage de la TV" >>"$LOG_FILE"
  fi
}

# Fonction pour mettre la TV en standby via CEC
turn_tv_standby() {
  echo "$(date): Tentative de mise en standby de la TV..." >>"$LOG_FILE"
  echo "standby 0" | cec-client -s -d 1

  if [ $? -eq 0 ]; then
    echo "$(date): TV mise en standby avec succès" >>"$LOG_FILE"
  else
    echo "$(date): ERREUR lors de la mise en standby de la TV" >>"$LOG_FILE"
  fi
}

# Vérifie l'heure actuelle et exécute les actions correspondantes
check_and_control_tv() {
  # Récupérer l'heure actuelle (forcer la base décimale)
  CURRENT_HOUR=$((10#$(date +%H)))
  CURRENT_MINUTE=$((10#$(date +%M)))

  # Créer un fichier de verrouillage pour chaque horaire
  MORNING_LOCK="/tmp/tv_morning_lock"
  EVENING_LOCK="/tmp/tv_evening_lock"

  # Fenêtre de 5 minutes pour les actions d'ALLUMAGE (05:00-05:05)
  if [[ "$CURRENT_HOUR" -eq 5 && "$CURRENT_MINUTE" -ge 0 && "$CURRENT_MINUTE" -le 5 ]]; then
    # Vérifier si on a déjà exécuté l'action aujourd'hui
    if [ ! -f "$MORNING_LOCK" ] || [ "$(cat "$MORNING_LOCK")" != "$(date +%Y-%m-%d)" ]; then
      echo "$(date): Allumage matinal programmé (05:00-05:05)" >>"$LOG_FILE"
      turn_tv_on
      # Marquer comme exécuté pour aujourd'hui
      echo "$(date +%Y-%m-%d)" >"$MORNING_LOCK"
    fi
  fi

  # Réinitialiser si en dehors de la fenêtre du matin
  if [[ "$CURRENT_HOUR" -ne 5 || "$CURRENT_MINUTE" -gt 5 ]]; then
    if [ -f "$MORNING_LOCK" ] && [ "$(cat "$MORNING_LOCK")" = "$(date +%Y-%m-%d)" ]; then
      if [ "$CURRENT_HOUR" -ne 5 ]; then
        # On garde le fichier, mais on change la date pour permettre l'exécution le jour suivant
        echo "$(date -d "yesterday" +%Y-%m-%d)" >"$MORNING_LOCK"
      fi
    fi
  fi

  # Fenêtre de 5 minutes pour les actions de mise en STANDBY (22:00-22:05)
  if [[ "$CURRENT_HOUR" -eq 22 && "$CURRENT_MINUTE" -ge 0 && "$CURRENT_MINUTE" -le 5 ]]; then
    if [ ! -f "$EVENING_LOCK" ] || [ "$(cat "$EVENING_LOCK")" != "$(date +%Y-%m-%d)" ]; then
      echo "$(date): Mise en standby du soir programmée (22:00-22:05)" >>"$LOG_FILE"
      turn_tv_standby
      echo "$(date +%Y-%m-%d)" >"$EVENING_LOCK"
    fi
  fi

  # Réinitialiser si en dehors de la fenêtre du soir
  if [[ "$CURRENT_HOUR" -ne 22 || "$CURRENT_MINUTE" -gt 5 ]]; then
    if [ -f "$EVENING_LOCK" ] && [ "$(cat "$EVENING_LOCK")" = "$(date +%Y-%m-%d)" ]; then
      if [ "$CURRENT_HOUR" -ne 22 ]; then
        echo "$(date -d "yesterday" +%Y-%m-%d)" >"$EVENING_LOCK"
      fi
    fi
  fi
}

# Ce script peut être appelé de différentes façons
case "$1" in
--check)
  # Vérifie si c'est l'heure d'exécuter une action
  check_and_control_tv
  ;;
--on)
  # Force l'allumage immédiat
  turn_tv_on
  ;;
--standby)
  # Force la mise en standby immédiate
  turn_tv_standby
  ;;
*)
  echo "Usage: $0 [--check|--on|--standby]"
  exit 1
  ;;
esac

exit 0
