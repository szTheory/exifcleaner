package File::HomeDir::MacOS9;

# Half-assed implementation for the legacy Mac OS9 operating system.
# Provided mainly to provide legacy compatibility. May be removed at
# a later date.

use 5.008003;
use strict;
use warnings;
use Carp                  ();
use File::HomeDir::Driver ();

use vars qw{$VERSION};
use base "File::HomeDir::Driver";

BEGIN
{
    $VERSION = '1.006';
}

# Load early if in a forking environment and we have
# prefork, or at run-time if not.
SCOPE:
{
    ## no critic qw(RequireInitializationForLocalVars, RequireCheckingReturnValueOfEval)
    local $@;
    eval "use prefork 'Mac::Files'";
}

#####################################################################
# Current User Methods

sub my_home
{
    my $class = shift;

    # Try for $ENV{HOME} if we have it
    if (defined $ENV{HOME})
    {
        return $ENV{HOME};
    }

    ### DESPERATION SETS IN

    # We could use the desktop
  SCOPE:
    {
        ## no critic qw(RequireInitializationForLocalVars, RequireCheckingReturnValueOfEval)
        local $@;
        eval {
            my $home = $class->my_desktop;
            return $home if $home and -d $home;
        };
    }

    # Desperation on any platform
  SCOPE:
    {
        # On some platforms getpwuid dies if called at all
        local $SIG{'__DIE__'} = '';
        my $home = (getpwuid($<))[7];
        return $home if $home and -d $home;
    }

    Carp::croak("Could not locate current user's home directory");
}

sub my_desktop
{
    my $class = shift;

    # Find the desktop via Mac::Files
    local $SIG{'__DIE__'} = '';
    require Mac::Files;
    my $home = Mac::Files::FindFolder(Mac::Files::kOnSystemDisk(), Mac::Files::kDesktopFolderType(),);
    return $home if $home and -d $home;

    Carp::croak("Could not locate current user's desktop");
}

#####################################################################
# General User Methods

sub users_home
{
    my ($class, $name) = @_;

  SCOPE:
    {
        # On some platforms getpwnam dies if called at all
        local $SIG{'__DIE__'} = '';
        my $home = (getpwnam($name))[7];
        return $home if defined $home and -d $home;
    }

    Carp::croak("Failed to find home directory for user '$name'");
}

1;

=pod

=head1 NAME

File::HomeDir::MacOS9 - Find your home and other directories on legacy Macintosh systems

=head1 SYNOPSIS

  use File::HomeDir;
  
  # Find directories for the current user
  $home    = File::HomeDir->my_home;
  $desktop = File::HomeDir->my_desktop;

=head1 DESCRIPTION

This module provides implementations for determining common user
directories on legacy Mac hosts. In normal usage this module will always be
used via L<File::HomeDir>.

This module is no longer actively maintained, and is included only for
extreme back-compatibility.

Only the C<my_home> and C<my_desktop> methods are supported.

=head1 SUPPORT

See the support section the main L<File::HomeDir> module.

=head1 AUTHORS

Adam Kennedy E<lt>adamk@cpan.orgE<gt>

Sean M. Burke E<lt>sburke@cpan.orgE<gt>

=head1 SEE ALSO

L<File::HomeDir>

=head1 COPYRIGHT

Copyright 2005 - 2011 Adam Kennedy.

Copyright 2017 - 2020 Jens Rehsack

Some parts copyright 2000 Sean M. Burke.

This program is free software; you can redistribute
it and/or modify it under the same terms as Perl itself.

The full text of the license can be found in the
LICENSE file included with this module.

=cut
